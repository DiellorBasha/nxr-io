classdef nxrzarr
% NXRZARR  Minimal pure-MATLAB Zarr v2 writer (uncompressed, single-chunk).
%
% Writes Zarr v2 stores that zarrita / @nxr/io / the cortical-flow app read
% directly. Each array is one folder with a .zarray (JSON) + a single raw
% little-endian chunk file in C (row-major) order. Groups carry .zgroup and
% optional .zattrs. Sparse matrices are written as COO subgroups.
%
% Designed for MATLAB R2023b (no native zarrcreate/zarrwrite).
%
% Public API (all static):
%   nxrzarr.initStore(path, attrs)             reset + create root group
%   nxrzarr.group(path, relPath, attrs)        create a (sub)group
%   nxrzarr.writeArray(path, relPath, A, opts) write a dense numeric/logical array
%   nxrzarr.writeSparse(path, relPath, S, opts) write a sparse matrix as COO
%   nxrzarr.struct2zarr(path, relPath, S, opts) mirror a MATLAB struct recursively
%   A = nxrzarr.readArray(path, relPath)        read back a single-chunk array (verify)
%
% opts fields (all optional):
%   .single         logical  downcast double dense arrays + sparse data to single
%   .skip           cellstr  field names to skip anywhere in struct2zarr
%   .maxStructArray scalar   struct-array / cell length above which it is skipped (default 16)
%   .attrs          struct   (writeArray only) per-array .zattrs

methods (Static)

    function initStore(storePath, attrs)
        if exist(storePath, 'dir'); rmdir(storePath, 's'); end
        mkdir(storePath);
        if nargin < 2; attrs = struct(); end
        nxrzarr.group(storePath, '', attrs);
    end

    function group(storePath, relPath, attrs)
        gdir = fullfile(storePath, relPath);
        if ~exist(gdir, 'dir'); mkdir(gdir); end
        nxrzarr.writeJson(fullfile(gdir, '.zgroup'), '{"zarr_format":2}');
        if nargin >= 3 && isstruct(attrs) && ~isempty(fieldnames(attrs))
            nxrzarr.writeJson(fullfile(gdir, '.zattrs'), jsonencode(attrs));
        end
    end

    function writeArray(storePath, relPath, data, opts)
        if nargin < 4; opts = struct(); end
        wantSingle = isfield(opts, 'single') && opts.single;

        % --- choose on-disk class + numpy dtype string ---
        if islogical(data)
            cls = 'uint8'; dt = '|b1'; data = uint8(data);
        elseif isa(data, 'double')
            if wantSingle; data = single(data); cls = 'single'; dt = '<f4';
            else;          cls = 'double';                 dt = '<f8'; end
        elseif isa(data, 'single')
            cls = 'single'; dt = '<f4';
        elseif isinteger(data)
            cls = class(data); dt = nxrzarr.dtypeStr(cls);
        else
            error('nxrzarr:unsupported', 'unsupported array class %s', class(data));
        end

        shape  = size(data);
        chunks = shape;                     % default: single chunk == full array
        if isfield(opts, 'chunks') && ~isempty(opts.chunks)
            chunks = double(opts.chunks(:)');
            if numel(chunks) ~= numel(shape)
                error('nxrzarr:chunks', 'chunks rank (%d) must match data rank (%d)', ...
                      numel(chunks), numel(shape));
            end
            % chunks may exceed shape: Zarr stores one fill-padded edge chunk (standard).
        end
        adir   = fullfile(storePath, relPath);
        if ~exist(adir, 'dir'); mkdir(adir); end

        zj = sprintf(['{"zarr_format":2,"shape":%s,"chunks":%s,"dtype":"%s",' ...
                      '"compressor":null,"fill_value":0,"order":"C",' ...
                      '"filters":null,"dimension_separator":"."}'], ...
                     nxrzarr.intArrJson(shape), nxrzarr.intArrJson(chunks), dt);
        nxrzarr.writeJson(fullfile(adir, '.zarray'), zj);
        if isfield(opts, 'attrs') && isstruct(opts.attrs) && ~isempty(fieldnames(opts.attrs))
            nxrzarr.writeJson(fullfile(adir, '.zattrs'), jsonencode(opts.attrs));
        end

        % --- write one file per chunk, C-order (row-major), fill-padded edges ---
        D       = numel(shape);
        nchunks = ceil(shape ./ chunks);
        idx     = zeros(1, D);
        for lin = 0:(prod(nchunks) - 1)
            rem = lin;                              % unravel linear index -> chunk coord
            for d = 1:D; idx(d) = mod(rem, nchunks(d)); rem = floor(rem / nchunks(d)); end
            ranges = cell(1, D);
            for d = 1:D
                lo = idx(d) * chunks(d) + 1;
                hi = min(lo + chunks(d) - 1, shape(d));
                ranges{d} = lo:hi;
            end
            block = data(ranges{:});
            if ~isequal(size(block), chunks)        % edge chunk -> pad to full chunk shape
                padded = zeros(chunks, cls);
                subs = cell(1, D);
                for d = 1:D; subs{d} = 1:numel(ranges{d}); end
                padded(subs{:}) = block;
                block = padded;
            end
            dp    = permute(block, D:-1:1);
            fname = strjoin(arrayfun(@(x) sprintf('%d', x), idx, 'UniformOutput', false), '.');
            fid   = fopen(fullfile(adir, fname), 'w', 'l');
            if fid < 0; error('nxrzarr:io', 'cannot open chunk %s', fullfile(adir, fname)); end
            fwrite(fid, dp, cls);
            fclose(fid);
        end
    end

    function writeSparse(storePath, relPath, S, opts)
        % Write a sparse matrix as CSC (matches @nxr/io sparse layout):
        %   group .zattrs { format:"csc", shape:[rows,cols], nnz }
        %   indptr  int32[cols+1]   indices int32[nnz]   data float32/64[nnz]
        % MATLAB stores sparse in CSC, and find() returns column-major order,
        % so indices/data are already in CSC order.
        if nargin < 4; opts = struct(); end
        [m, n]       = size(S);
        [ii, jj, vv] = find(S);                       % column-major (CSC) order
        counts       = accumarray(jj, 1, [n, 1]);     % nnz per column
        indptr       = int32([0; cumsum(counts)]);    % length cols+1, 0-based offsets
        indices      = int32(ii - 1);                 % 0-based row indices

        nxrzarr.group(storePath, relPath, ...
            struct('format', 'csc', 'shape', [m n], 'nnz', numel(vv)));
        nxrzarr.writeArray(storePath, [relPath '/indptr'],  indptr);
        nxrzarr.writeArray(storePath, [relPath '/indices'], indices);
        nxrzarr.writeArray(storePath, [relPath '/data'],    vv, opts);   % opts.single -> float32
    end

    function struct2zarr(storePath, relPath, S, opts)
        if nargin < 4; opts = struct(); end
        if ~isfield(opts, 'skip');           opts.skip = {};           end
        if ~isfield(opts, 'maxStructArray'); opts.maxStructArray = 16; end
        assert(isscalar(S) && isstruct(S), 'struct2zarr expects a scalar struct');

        fns   = fieldnames(S);
        attrs = struct();
        for k = 1:numel(fns)
            f = fns{k};
            if any(strcmp(f, opts.skip)); continue; end
            v = S.(f);
            if ischar(v) && size(v, 1) <= 1
                attrs.(f) = string(v);                      % scalar/empty char -> attr
            elseif (isnumeric(v) || islogical(v)) && isscalar(v)
                attrs.(f) = v;                              % scalar number -> attr
            end
        end
        nxrzarr.group(storePath, relPath, attrs);

        for k = 1:numel(fns)
            f = fns{k};
            if any(strcmp(f, opts.skip)); continue; end
            v = S.(f);
            if isempty(relPath); child = f; else; child = [relPath '/' f]; end

            if isempty(v); continue; end
            if ischar(v) || ((isnumeric(v) || islogical(v)) && isscalar(v)); continue; end

            if issparse(v)
                nxrzarr.writeSparse(storePath, child, v, opts);
            elseif isnumeric(v) || islogical(v)
                nxrzarr.writeArray(storePath, child, v, opts);
            elseif isstruct(v)
                if isscalar(v)
                    nxrzarr.struct2zarr(storePath, child, v, opts);
                elseif numel(v) <= opts.maxStructArray
                    nxrzarr.group(storePath, child, ...
                        struct('itemType', 'struct', 'length', numel(v)));
                    for m = 1:numel(v)
                        nxrzarr.struct2zarr(storePath, sprintf('%s/i%04d', child, m), v(m), opts);
                    end
                else
                    warning('nxrzarr:skip', 'skip struct-array %s (numel=%d > %d)', ...
                            child, numel(v), opts.maxStructArray);
                end
            elseif iscell(v)
                if numel(v) <= opts.maxStructArray
                    nxrzarr.group(storePath, child, ...
                        struct('itemType', 'cell', 'length', numel(v)));
                    for m = 1:numel(v)
                        item = v{m};
                        ic = sprintf('%s/i%04d', child, m);
                        if isempty(item); continue; end
                        if ischar(item)
                            nxrzarr.group(storePath, ic, struct('value', string(item)));
                        elseif issparse(item)
                            nxrzarr.writeSparse(storePath, ic, item, opts);
                        elseif isnumeric(item) || islogical(item)
                            nxrzarr.writeArray(storePath, ic, item, opts);
                        elseif isstruct(item) && isscalar(item)
                            nxrzarr.struct2zarr(storePath, ic, item, opts);
                        else
                            warning('nxrzarr:skip', 'skip cell item %s (%s)', ic, class(item));
                        end
                    end
                else
                    warning('nxrzarr:skip', 'skip cell %s (numel=%d)', child, numel(v));
                end
            end
        end
    end

    function A = readArray(storePath, relPath)
        % Read back an array written by writeArray, reassembling all chunks (verification).
        adir     = fullfile(storePath, relPath);
        za       = jsondecode(fileread(fullfile(adir, '.zarray')));
        shape    = double(za.shape(:)');
        chunks   = double(za.chunks(:)');
        [cls, ~] = nxrzarr.dtype2cls(za.dtype);
        D        = numel(shape);
        A        = zeros(shape, cls);
        nchunks  = ceil(shape ./ chunks);
        idx      = zeros(1, D);
        for lin = 0:(prod(nchunks) - 1)
            rem = lin;
            for d = 1:D; idx(d) = mod(rem, nchunks(d)); rem = floor(rem / nchunks(d)); end
            fname    = strjoin(arrayfun(@(x) sprintf('%d', x), idx, 'UniformOutput', false), '.');
            fid      = fopen(fullfile(adir, fname), 'r', 'l');
            raw      = fread(fid, prod(chunks), ['*' cls]);
            fclose(fid);
            chunkArr = permute(reshape(raw, fliplr(chunks)), D:-1:1);  % full (padded) chunk
            ranges = cell(1, D); crop = cell(1, D);
            for d = 1:D
                lo = idx(d) * chunks(d) + 1;
                hi = min(lo + chunks(d) - 1, shape(d));
                ranges{d} = lo:hi; crop{d} = 1:(hi - lo + 1);
            end
            A(ranges{:}) = chunkArr(crop{:});
        end
    end
end

methods (Static, Access = private)

    function writeJson(fpath, str)
        fid = fopen(fpath, 'w');
        if fid < 0; error('nxrzarr:io', 'cannot write %s', fpath); end
        fwrite(fid, str, 'char');
        fclose(fid);
    end

    function s = intArrJson(v)
        parts = arrayfun(@(x) sprintf('%d', round(x)), v(:)', 'UniformOutput', false);
        s = ['[' strjoin(parts, ',') ']'];
    end

    function dt = dtypeStr(cls)
        switch cls
            case 'int8';   dt = '|i1';
            case 'uint8';  dt = '|u1';
            case 'int16';  dt = '<i2';
            case 'uint16'; dt = '<u2';
            case 'int32';  dt = '<i4';
            case 'uint32'; dt = '<u4';
            case 'int64';  dt = '<i8';
            case 'uint64'; dt = '<u8';
            case 'single'; dt = '<f4';
            case 'double'; dt = '<f8';
            otherwise; error('nxrzarr:dtype', 'no dtype for class %s', cls);
        end
    end

    function [cls, nbytes] = dtype2cls(dt)
        map = { '|b1','uint8',1; '|i1','int8',1; '|u1','uint8',1; ...
                '<i2','int16',2; '<u2','uint16',2; '<i4','int32',4; '<u4','uint32',4; ...
                '<i8','int64',8; '<u8','uint64',8; '<f4','single',4; '<f8','double',8 };
        idx = find(strcmp(dt, map(:,1)), 1);
        if isempty(idx); error('nxrzarr:dtype', 'unknown dtype %s', dt); end
        cls = map{idx,2}; nbytes = map{idx,3};
    end
end
end
