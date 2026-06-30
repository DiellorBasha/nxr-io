function test_canonical(store)
% TEST_CANONICAL  Round-trip reconstruction test: assert J = W * F(GoodChannels, t)
%
%   test_canonical()           % uses out/Subject01.nxr.zarr
%   test_canonical(storePath)  % explicit store path

    if nargin < 1; store = fullfile(pwd,'out','Subject01.nxr.zarr'); end

    % Load inverse kernel W  [nsrc, M]
    W = nxrzarr.readArray(store, 'maps/inverse/W');

    % Load inverse attributes to get ch_names
    zi = jsondecode(fileread(fullfile(store, 'maps', 'inverse', '.zattrs')));

    % Load sensor recording data F  [nChan, nTime]
    F = nxrzarr.readArray(store, 'sensors/recordings/S01_AEF_20131218_01_notch/data');

    % Load full channel name list from sensors/.zattrs
    names = jsondecode(fileread(fullfile(store, 'sensors', '.zattrs'))).channel_names;

    % Map ch_names (kernel channels) into full channel list -> row indices gi
    [tf, gi] = ismember(string(zi.ch_names), string(names));
    assert(all(tf), 'ch_names NOT a subset of channel_names — channel-set mismatch');

    % Reconstruct at first time point: J = W * F(gi, 1)
    t = 1;
    J = W * double(F(gi, t));

    % Assertions
    assert(numel(J) == size(W,1), 'J length (%d) != nsrc (%d)', numel(J), size(W,1));
    assert(all(isfinite(J)), 'J contains non-finite values');

    fprintf('test_canonical OK: nsrc=%d M=%d |J(t=1)|=%.6g\n', numel(J), numel(zi.ch_names), norm(J));

    % ---- canonical timeseries group (nxr.timeseries@1.0) ----
    tsBase = 'timeseries/S01_AEF_20131218_01_notch';
    Fts = nxrzarr.readArray(store, [tsBase '/data']);
    assert(isequal(size(Fts), size(F)), ...
        'timeseries data shape %s != recordings %s', mat2str(size(Fts)), mat2str(size(F)));
    assert(isequaln(single(Fts), single(F)), 'timeseries data != recordings data');
    za = jsondecode(fileread(fullfile(store, 'timeseries', 'S01_AEF_20131218_01_notch', '.zattrs')));
    assert(strcmp(za.schema, 'nxr.timeseries@1.0'), 'bad timeseries schema tag: %s', za.schema);
    assert(strcmp(za.kind, 'sensor'), 'bad kind: %s', za.kind);
    assert(iscell(za.axes) && strcmp(za.axes{end}, 'time'), 'axes last element must be ''time''');
    assert(za.n_samples == size(F, 2), 'n_samples %d != nTime %d', za.n_samples, size(F, 2));
    assert(isfield(za, 'sfreq') && isfield(za, 'origin_sec'), 'missing sfreq/origin_sec attrs');
    assert(strcmp(za.metadata_ref, 'sensors'), 'metadata_ref must be ''sensors''');
    fprintf('test_canonical timeseries OK: %dx%d sfreq=%.4g origin=%.4g\n', ...
        size(Fts,1), size(Fts,2), za.sfreq, za.origin_sec);
end
