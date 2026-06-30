function store = export_canonical(cfg)
% EXPORT_CANONICAL  Mirror one Brainstorm condition into a canonical nxr.subject@1.0
% Zarr store (manifold + sensors/recordings + maps), readable by @nxr/io + cortical-flow.
%
%   store = export_canonical()        % uses built-in TutorialAuditory defaults (SpikeData-2)
%   store = export_canonical(cfg)     % cfg overrides any field below
%
% After this task the store contains:
%   manifold/mesh/vertices          f64 [V,3]  vertex positions (m)
%   manifold/mesh/faces             i32 [F,3]  triangle indices, 0-based, CCW-outward
%   manifold/mesh/.zattrs           { face_winding: 'ccw-outward' }
%     (vertex_normals are NOT written — the outward normal derives from winding)

    root = '/Volumes/SpikeData-2/workspace/library/datasets/brainstorm_db/TutorialAuditory';
    cond = fullfile(root, 'data', 'Subject01', 'S01_AEF_20131218_01_notch');
    anat = fullfile(root, 'anat', 'Subject01');
    d.bstRoot       = root;
    d.surfaceFile   = fullfile(anat, 'tess_cortex_pial_low.mat');
    d.kernelFile    = fullfile(cond, 'results_dSPM-unscaled_MEG_KERNEL_260612_1800.mat');
    d.dataFile      = fullfile(cond, 'data_block001_02_band.mat');
    d.channelFile   = fullfile(cond, 'channel_ctf_acc1.mat');
    d.noisecovFile  = fullfile(cond, 'noisecov_full.mat');
    d.session       = 'S01_AEF_20131218_01_notch';
    d.store         = fullfile(pwd, 'out', 'Subject01.nxr.zarr');
    d.timeChunk     = 2400;
    if nargin < 1; cfg = struct(); end
    cfg = setdefaults(cfg, d);
    store = cfg.store;

    fprintf('Export -> %s\n', store);
    nxrzarr.initStore(store, struct('schema', 'nxr.subject@1.0', ...
        'sourceFormat', 'brainstorm', ...
        'subject',      'Subject01', ...
        'condition',    cfg.session, ...
        'createdBy',    sprintf('export_canonical / MATLAB %s', version)));

    % ---- manifold ----
    fprintf('  manifold ...\n');
    Surf = load(cfg.surfaceFile);
    % Canonicalize face winding to CCW-outward (per component) so the Zarr is the
    % single source of truth: cross(B-A,C-A) is the outward normal for both
    % nxr-compute and three.js. vertex_normals are NOT written — the outward
    % normal derives from the canonical winding downstream.
    [Fcanon, wInfo] = canonicalize_winding(Surf.Vertices, Surf.Faces);
    fprintf('  winding: %d component(s), flipped %s -> ccw-outward\n', wInfo.nComp, mat2str(wInfo.flipped));
    nxrzarr.group(store, 'manifold', struct());
    nxrzarr.group(store, 'manifold/mesh', struct('face_winding', 'ccw-outward'));
    nxrzarr.writeArray(store, 'manifold/mesh/vertices', double(Surf.Vertices));   % [V,3] f64
    nxrzarr.writeArray(store, 'manifold/mesh/faces',    int32(Fcanon) - 1);       % [F,3] i32, 0-based, CCW-outward

    % ---- sensors (channels) ----
    fprintf('  sensors ...\n');
    Chan = load(cfg.channelFile); Ch = Chan.Channel; nC = numel(Ch);
    names = cell(1,nC); types = cell(1,nC); loc = nan(nC,3);
    for c = 1:nC
        names{c} = Ch(c).Name; types{c} = Ch(c).Type;
        if ~isempty(Ch(c).Loc); loc(c,:) = Ch(c).Loc(:,1)'; end   % first coil position
    end
    Data = load(cfg.dataFile);
    flags = int8(Data.ChannelFlag(:));                              % +1 good / -1 bad
    modalities = unique(types, 'stable');
    % Primary modality = most-frequent channel type
    [sortedMods, ~, ic] = unique(types);
    counts = accumarray(ic(:), 1);
    [~, imax] = max(counts);
    primaryModality = sortedMods{imax};   % imax indexes sorted list, not stable
    sAttrs = struct();
    sAttrs.channel_names = names;
    sAttrs.channel_types = types;
    sAttrs.modalities    = modalities;
    nxrzarr.group(store, 'sensors', sAttrs);
    nxrzarr.writeArray(store, 'sensors/positions', single(loc));   % [nChan,3] f32
    nxrzarr.writeArray(store, 'sensors/flags',     flags);         % [nChan] i8

    % ---- recordings (continuous segment; F chunked along time) ----
    fprintf('  recordings ...\n');
    nxrzarr.group(store, 'sensors/recordings', struct());
    base = ['sensors/recordings/' cfg.session];
    t = Data.Time(:);  sfreq = 1 / mean(diff(t));
    % events -> parallel arrays; Brainstorm Events(e).label / .times ([1×k] or [2×k])
    en = {}; et = []; ech = [];
    if isfield(Data,'Events') && ~isempty(Data.Events)
        for e = 1:numel(Data.Events)
            tk = Data.Events(e).times; tk = tk(1,:);               % onset row only
            for k = 1:numel(tk)
                en{end+1}  = Data.Events(e).label;                 %#ok<AGROW>
                et(end+1)  = tk(k);                                %#ok<AGROW>
                ech(end+1) = -1;                                   %#ok<AGROW>
            end
        end
    end
    rAttrs = struct('sfreq', sfreq, 'modality', primaryModality, ...
                    'data_type', 'recordings', 'units', 'T');
    rAttrs.event_names    = en;
    rAttrs.event_times    = et;
    rAttrs.event_channels = ech;
    nxrzarr.group(store, base, rAttrs);
    nxrzarr.writeArray(store, [base '/data'],  single(Data.F), ...
        struct('chunks', [size(Data.F,1), cfg.timeChunk]));        % [nChan, nTime] f32, chunked
    nxrzarr.writeArray(store, [base '/times'], t(:)');             % [1, nTime] f64

    % ---- canonical timeseries (type-agnostic; same data as recordings, time-axis attrs) ----
    % Dual-emitted alongside sensors/recordings during the migration: the
    % cortical-flow DataOrchestrator consumes timeseries/<name>; the legacy
    % recordings group stays until the app cuts over (Plan 3). Time is the LAST
    % axis; the time vector is carried by attributes (no stored times array).
    fprintf('  timeseries ...\n');
    nxrzarr.group(store, 'timeseries', struct());
    tsBase = ['timeseries/' cfg.session];
    tsAttrs = struct('schema', 'nxr.timeseries@1.0', 'kind', 'sensor');
    tsAttrs.axes          = {'channel', 'time'};
    tsAttrs.sfreq         = sfreq;
    tsAttrs.n_samples     = size(Data.F, 2);
    tsAttrs.origin_sec    = t(1);
    tsAttrs.metadata_ref  = 'sensors';
    tsAttrs.event_names    = en;
    tsAttrs.event_times    = et;
    tsAttrs.event_channels = ech;
    nxrzarr.group(store, tsBase, tsAttrs);
    nxrzarr.writeArray(store, [tsBase '/data'], single(Data.F), ...
        struct('chunks', [size(Data.F, 1), cfg.timeChunk]));   % [nChan, nTime] f32, chunked along time

    % ---- maps (inverse kernel + forward + whitening) ----
    fprintf('  maps ...\n');
    Kern = load(cfg.kernelFile);
    K    = Kern.ImagingKernel;                           % [nsrc, M]  nsrc = 3*nV for free
    good = Kern.GoodChannel(:)';                         % [1×M] indices into Channel (1-based)
    chNames = names(good);                               % M kernel channel names

    isFree = isfield(Kern,'nComponents') && Kern.nComponents == 3;
    assert(size(K,1) == 3*size(Surf.Vertices,1), ...
        'ImagingKernel rows (%d) != 3*nV (%d)', size(K,1), 3*size(Surf.Vertices,1));

    nxrzarr.group(store, 'maps', struct('schema','nxr.maps@1.0'));
    invAttrs = struct('method','dSPM'); invAttrs.ch_names = chNames;
    nxrzarr.group(store, 'maps/inverse', invAttrs);
    nxrzarr.writeArray(store, 'maps/inverse/W', double(K));      % [nsrc, M] f64

    % Forward geometry: Kern.GridLoc is empty in KERNEL result files;
    % load GridLoc/GridOrient from the head model directly.
    HM = load(fullfile(cfg.bstRoot, 'data', Kern.HeadModelFile));
    GL = HM.GridLoc;                                     % [nV, 3]
    nV = size(GL, 1);
    if isFree
        % Brainstorm free-orient interleaving: [v0x,v0y,v0z, v1x,v1y,v1z, ...]
        % source_rr: each vertex location repeated 3x consecutively -> [3nV,3]
        rr = repelem(GL, 3, 1);
        % source_nn: 3 ambient identity axes per vertex -> [3nV,3]
        nn = expandFreeOrient(nV);
    else
        rr = GL;
        nn = HM.GridOrient;
    end
    fwdAttrs = struct('source_ori', ternary(isFree, 'free', 'fixed'));
    nxrzarr.group(store, 'maps/forward', fwdAttrs);
    nxrzarr.writeArray(store, 'maps/forward/source_rr', single(rr));  % [nsrc,3] f32
    nxrzarr.writeArray(store, 'maps/forward/source_nn', single(nn));  % [nsrc,3] f32

    % Whitener and noise covariance (M-channel space, same ordering as ch_names)
    nxrzarr.writeArray(store, 'maps/inverse/whitener',  double(Kern.Whitener));                     % [M,M] f64
    nxrzarr.writeArray(store, 'maps/inverse/noise_cov', double(Kern.Options.NoiseCovMat.NoiseCov)); % [M,M] f64

    fprintf('Done. Store at %s\n', store);
end

function cfg = setdefaults(cfg, d)
    f = fieldnames(d);
    for i = 1:numel(f)
        if ~isfield(cfg, f{i}); cfg.(f{i}) = d.(f{i}); end
    end
end

function y = ternary(c, a, b)
    if c; y = a; else; y = b; end
end

function nn = expandFreeOrient(nV)
    % Return [3*nV, 3] matrix of ambient identity axes, one triplet per vertex.
    % Row order: [v0_x; v0_y; v0_z; v1_x; v1_y; v1_z; ...] matching Brainstorm interleaving.
    I  = eye(3);
    nn = zeros(3*nV, 3);
    for v = 1:nV
        nn(3*(v-1)+(1:3), :) = I;
    end
end
