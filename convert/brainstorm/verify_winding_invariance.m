function verify_winding_invariance(surfaceFile)
% VERIFY_WINDING_INVARIANCE  Gate: confirm canonicalize_winding's face flip is
% SAFE for the differential/spectral stack — invariant where it must be,
% standard-sign where it must be — before re-exporting.
%
% The scalar machinery (Laplacian -> eigenmodes, heat, Poisson, spectral) is the
% COTANGENT Laplacian, which geometry-central/nxr-compute use verbatim
% (requireCotanLaplacian). Cotan weights depend only on triangle geometry
% (edge vectors), NOT on the winding order, so L(F) == L(flipped F) exactly ->
% eigenmodes identical. The orientation-COVARIANT part is the winding normal
% cross(B-A,C-A): it flips sign under the flip and, post-flip, points OUTWARD
% (so curl = N x v takes the standard sign). This empirically demonstrates both.
%
% USAGE: verify_winding_invariance('.../Subject01/tess_cortex_pial_low.mat')

    S = load(surfaceFile, 'Vertices','Faces');
    V = S.Vertices; F = S.Faces;
    Ff = canonicalize_winding(V, F);
    assert(~isequal(F, Ff), 'expected a flip for a Brainstorm surface (already canonical?)');
    fprintf('flipped %d / %d faces\n', sum(any(F~=Ff,2)), size(F,1));

    % --- INVARIANT: cotan Laplacian identical on F vs Ff ---
    L0 = cotan_laplacian(V, F);
    L1 = cotan_laplacian(V, Ff);
    dL = full(max(max(abs(L0 - L1))));
    fprintf('max|L(F) - L(Ff)| = %.3e   (expect ~0 -> eigenmodes identical)\n', dL);
    assert(dL < 1e-9, 'cotan Laplacian NOT winding-invariant');

    % eigenmodes (lumped mass) match
    A = vertex_areas(V, F); M = spdiags(A, 0, numel(A), numel(A));
    k = 8;
    [U0, D0] = eigs(L0, M, k, 'smallestabs');
    [U1, D1] = eigs(L1, M, k, 'smallestabs');
    d0 = sort(diag(D0)); d1 = sort(diag(D1));
    fprintf('max|eigenvalue Δ| = %.3e\n', max(abs(d0 - d1)));
    md = abs(corr(U0(:,5), U1(:,5)));
    fprintf('mode 5 |corr| = %.4f   (expect ~1, invariant up to global sign)\n', md);

    % --- COVARIANT: winding normal flips sign + Ff is OUTWARD ---
    Nw = @(Fx) normr_(cross(V(Fx(:,2),:)-V(Fx(:,1),:), V(Fx(:,3),:)-V(Fx(:,1),:), 2));
    N0 = Nw(F); N1 = Nw(Ff);
    flippedFaces = any(F~=Ff,2);
    fprintf('winding normal sign-flip on flipped faces: mean dot = %.4f (expect ~-1)\n', ...
        mean(sum(N0(flippedFaces,:).*N1(flippedFaces,:), 2)));
    % outward proof of Ff: signed volume must be POSITIVE (rigorous for a closed
    % surface — a centroid-from-center proxy is unreliable on a folded cortex).
    sv = @(Fx) sum(sum(V(Fx(:,1),:).*cross(V(Fx(:,2),:),V(Fx(:,3),:),2),2))/6;
    fprintf('signed volume: F = %.4e -> Ff = %.4e (expect Ff>0 = outward)\n', sv(F), sv(Ff));
    assert(sv(Ff) > 0, 'canonical Ff signed volume not positive (not outward)');

    if dL < 1e-9 && max(abs(d0-d1)) < 1e-6 && md > 0.999
        fprintf('PASS: scalar/spectral invariant; winding flip is safe + outward.\n');
    else
        error('verify_winding_invariance:FAIL', 'invariance assertions not met');
    end
end

function L = cotan_laplacian(V, F)
% Standard cotangent Laplacian (positive-semidefinite, L = sum of edge weights).
    nV = size(V,1);
    i1=F(:,1); i2=F(:,2); i3=F(:,3);
    % cot of the angle AT each vertex = dot(e_a,e_b)/|cross(e_a,e_b)|
    cot1 = cotv(V(i2,:)-V(i1,:), V(i3,:)-V(i1,:));  % at i1 -> opposite edge (i2,i3)
    cot2 = cotv(V(i3,:)-V(i2,:), V(i1,:)-V(i2,:));  % at i2 -> opposite edge (i3,i1)
    cot3 = cotv(V(i1,:)-V(i3,:), V(i2,:)-V(i3,:));  % at i3 -> opposite edge (i1,i2)
    I = [i2; i3; i3; i1; i1; i2];
    J = [i3; i2; i1; i3; i2; i1];
    W = 0.5 * [cot1; cot1; cot2; cot2; cot3; cot3];
    Woff = sparse(I, J, -W, nV, nV);
    L = Woff - spdiags(sum(Woff,2), 0, nV, nV);   % rows sum to 0
end

function c = cotv(a, b)
    c = sum(a.*b,2) ./ max(sqrt(sum(cross(a,b,2).^2,2)), eps);
end

function A = vertex_areas(V, F)
    ar = 0.5*sqrt(sum(cross(V(F(:,2),:)-V(F(:,1),:), V(F(:,3),:)-V(F(:,1),:), 2).^2,2));
    A = accumarray([F(:,1);F(:,2);F(:,3)], [ar;ar;ar]/3, [size(V,1) 1]);
end

function N = normr_(X)
    N = X ./ max(sqrt(sum(X.^2,2)), eps);
end
