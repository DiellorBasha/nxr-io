function [F, info] = canonicalize_winding(V, F)
% CANONICALIZE_WINDING  Flip face winding per connected component so that the
% winding normal cross(B-A, C-A) points OUTWARD (CCW-for-outward), matching the
% nxr-compute and three.js conventions.
%
% Brainstorm winds faces CW-for-outward (its winding normal is inward); both
% nxr-compute (geometry-central faceNormals) and three.js (CCW = front) read
% that as "backwards". This makes the exported faces the single source of truth:
% after canonicalization, cross(B-A,C-A) is the outward normal, so downstream
% needs no flip and no separate VertNormals.
%
% Detection is purely geometric (signed volume) per connected component — each
% hemisphere is a watertight closed surface, so V<0 means that component's
% winding is inward. The flip is GLOBAL within a component (geometry-central
% requires a consistently-oriented manifold; a partial flip would corrupt it).
% Idempotent: a component already CCW-outward is left untouched.
%
% USAGE:  [F, info] = canonicalize_winding(V, F)
% INPUT:  V : [nV,3] vertex positions
%         F : [nF,3] triangle vertex indices (1-based)
% OUTPUT: F    : [nF,3] faces, canonicalized to CCW-outward
%         info : struct('nComp', k, 'flipped', [components flipped])

    % Vertex adjacency from the three directed edges of every face.
    G = graph([F(:,1); F(:,2); F(:,3)], [F(:,2); F(:,3); F(:,1)]);
    comp  = conncomp(G);          % [1, nV] component label per vertex
    fcomp = comp(F(:,1));         % component label per face (any vertex suffices)
    info  = struct('nComp', max(comp), 'flipped', []);

    for c = 1:max(comp)
        idx = find(fcomp == c);
        if isempty(idx); continue; end
        Fi = F(idx,:);
        v0 = V(Fi(:,1),:); v1 = V(Fi(:,2),:); v2 = V(Fi(:,3),:);
        Vol = sum(sum(v0 .* cross(v1, v2, 2), 2)) / 6;   % signed volume of the component
        if abs(Vol) < eps('single')
            warning('canonicalize_winding:openComponent', ...
                'Component %d signed volume ~0 (open/non-watertight surface?); left as-is.', c);
            continue;
        end
        if Vol < 0
            F(idx, [2 3]) = F(idx, [3 2]);               % flip winding -> outward
            info.flipped(end+1) = c;                     %#ok<AGROW>
        end
    end
end
