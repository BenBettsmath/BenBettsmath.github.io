AcyclicMatching = new Type of HashTable;

makeAcyclicMatching = method(TypicalValue => AcyclicMatching);
makeAcyclicMatching(List, CGGraph) := AcyclicMatching => (edgs, graph) -> (
    tbl := new MutableHashTable;
    mkSet := {};
    for e in edgs do (
        sk := getVertexKey getEdgeSource e; tk := getVertexKey getEdgeTarget e;
        tbl#sk = e; tbl#tk = e;
        mkSet = mkSet | {sk, tk};
    );
    mkSet = set mkSet;
    homog    := all(edgs, e -> getEdgeSourceDegree e - getEdgeTargetDegree e == 1);
    allUnits := all(edgs, e -> isUnit(getEdgeWeight e));
    flipped  := flipGraphEdges(graph, edgs);
    acyc     := true;
    stateT   := new MutableHashTable;
    for v in getGraphVertices flipped do stateT#(getVertexKey v) = 0;
    for v in getGraphVertices flipped do (
        if stateT#(getVertexKey v) == 0 and acyc then (
            stack := {(v, 0)};
            while #stack > 0 and acyc do (
                top := last stack; cur := top#0; curK := getVertexKey cur;
                if stateT#curK == 0 then stateT#curK = 1;
                outs := getOutgoingEdges(flipped, cur);
                idx  := top#1;
                if idx >= #outs then (stateT#curK = 2; stack = drop(stack, -1);)
                else (
                    stack = replace(#stack-1, (cur, idx+1), stack);
                    nxt := getEdgeTarget outs#idx; nxtK := getVertexKey nxt;
                    if stateT#nxtK == 1 then acyc = false
                    else if stateT#nxtK == 0 then stack = append(stack, (nxt, 0));
                );
            );
        );
    );
    new AcyclicMatching from {
        symbol edges        => edgs,
        symbol edgeTable    => new HashTable from pairs tbl,
        symbol matchedKeys  => mkSet,
        symbol isHomogeneous=> homog,
        symbol isAcyclic    => acyc,
        symbol isMorse      => homog and acyc and allUnits
    }
);
makeAcyclicMatching(List, ComplexGraph) := AcyclicMatching => (edges, cg) ->
    makeAcyclicMatching(edges, getCGGraph cg);

getMatchingEdges = method(TypicalValue => List);
getMatchingEdges(AcyclicMatching) := List => m -> m.edges;

getMatchingEdgeCount = method(TypicalValue => ZZ);
getMatchingEdgeCount(AcyclicMatching) := ZZ => m -> #(m.edges);

isMatchedVertex = method(TypicalValue => Boolean);
isMatchedVertex(AcyclicMatching, CGVertex) := Boolean => (m, v) ->
    member(getVertexKey v, m.matchedKeys);

getMatchedEdge = method();
getMatchedEdge(AcyclicMatching, CGVertex) := (m, v) -> (
    tbl := m.edgeTable; k := getVertexKey v;
    if tbl#?k then tbl#k else null
);

isMatchingHomogeneous = method(TypicalValue => Boolean);
isMatchingHomogeneous(AcyclicMatching) := Boolean => m -> m.isHomogeneous;

isMatchingAcyclic = method(TypicalValue => Boolean);
isMatchingAcyclic(AcyclicMatching) := Boolean => m -> m.isAcyclic;

isMatchingMorse = method(TypicalValue => Boolean);
isMatchingMorse(AcyclicMatching) := Boolean => m -> m.isMorse;

net AcyclicMatching := m -> (
    props := {};
    if m.isMorse then props = {"Morse"}
    else (
        if m.isHomogeneous then props = append(props, "homogeneous");
        if m.isAcyclic     then props = append(props, "acyclic");
    );
    pStr := if #props > 0 then ", " | demark(", ", props) else "";
    net("AcyclicMatching(" | toString(#(m.edges)) | " edges" | pStr | ")")
);

criticalVertices = method(TypicalValue => List);
criticalVertices(CGGraph, List) := List => (g, matchEdges) -> (
    mk := set flatten for e in matchEdges list
        {getVertexKey getEdgeSource e, getVertexKey getEdgeTarget e};
    select(getGraphVertices g, v -> not member(getVertexKey v, mk))
);
criticalVertices(ComplexGraph, List)            := List => (cg, me) -> criticalVertices(getCGGraph cg, me);
criticalVertices(CGGraph, AcyclicMatching)      := List => (g, m)   -> criticalVertices(g, getMatchingEdges m);
criticalVertices(ComplexGraph, AcyclicMatching) := List => (cg, m)  -> criticalVertices(getCGGraph cg, getMatchingEdges m);

tryMatchEdge = (bestEdge, matching, matchedKeys, tgtMap) -> (
    tgtKey := getVertexKey getEdgeTarget bestEdge;
    if tgtMap#?tgtKey then (
        prev := tgtMap#tgtKey;
        if getVertexIndex getEdgeSource bestEdge < getVertexIndex getEdgeSource prev then (
            matching    = select(matching, e -> not edgeEqual(e, prev));
            matchedKeys = matchedKeys - set {getVertexKey getEdgeSource prev,
                                             getVertexKey getEdgeTarget prev};
            matching    = append(matching, bestEdge);
            matchedKeys = matchedKeys + set {getVertexKey getEdgeSource bestEdge, tgtKey};
            tgtMap#tgtKey = bestEdge;
        );
    ) else (
        matching    = append(matching, bestEdge);
        matchedKeys = matchedKeys + set {getVertexKey getEdgeSource bestEdge, tgtKey};
        tgtMap#tgtKey = bestEdge;
    );
    (matching, matchedKeys)
);

bmMatchingDown = method(TypicalValue => AcyclicMatching);
bmMatchingDown(ComplexGraph) := AcyclicMatching => cg ->
    makeAcyclicMatching(bmMatchingDownEdges getCGGraph cg, cg);
bmMatchingDown(CGGraph) := AcyclicMatching => g ->
    makeAcyclicMatching(bmMatchingDownEdges g, g);

bmMatchingDownEdges = g -> (
    byDeg := getGraphVerticesByDegree g;
    maxD  := getGraphMaxDegree g;
    allE  := getGraphEdges g;
    matching := {}; mk := set {};

    for d in reverse(2 .. maxD) do (
        if byDeg#?d then (
            unmatched := sortByKey(
                select(byDeg#d, v -> not member(getVertexKey v, mk)),
                v -> getVertexIndex v);
            for idx in reverse(0 .. #unmatched - 1) do (
                cand  := unmatched#idx;
                unitE := select(allE, e ->
                    vertexEqual(getEdgeSource e, cand) and isUnit(getEdgeWeight e));
                if #unitE > 0 then (
                    sel := unitE#0;
                    for e in unitE do
                        if getVertexIndex getEdgeTarget e > getVertexIndex getEdgeTarget sel
                        then sel = e;
                    matching = append(matching, sel);
                    mk = mk + set {getVertexKey getEdgeSource sel,
                                   getVertexKey getEdgeTarget sel};
                );
            );
        );
    );

    corrected := {};
    for e in matching do (
        wins := true;
        for e2 in matching do (
            if not edgeEqual(e, e2) and vertexEqual(getEdgeTarget e, getEdgeTarget e2) then (
                if getVertexIndex getEdgeSource e2 < getVertexIndex getEdgeSource e then
                    (wins = false; break;);
            );
        );
        if wins and not any(corrected, x -> edgeEqual(x, e)) then
            corrected = append(corrected, e);
    );
    corrected
);

greedyDown = method(TypicalValue => AcyclicMatching);
greedyDown(ComplexGraph) := AcyclicMatching => cg ->
    makeAcyclicMatching(greedyDownEdges getCGGraph cg, cg);
greedyDown(CGGraph) := AcyclicMatching => g ->
    makeAcyclicMatching(greedyDownEdges g, g);

greedyDownEdges = g -> (
    byDeg := getGraphVerticesByDegree g; maxD := getGraphMaxDegree g; allE := getGraphEdges g;
    matching := {}; mk := set {}; tgtMap := new MutableHashTable;
    for d in reverse(2 .. maxD) do (
        if byDeg#?d then (
            unmatched := sortByKey(
                select(byDeg#d, v -> not member(getVertexKey v, mk)),
                v -> getVertexIndex v);
            for cand in unmatched do (
                unitE := select(allE, e ->
                    vertexEqual(getEdgeSource e, cand) and isUnit(getEdgeWeight e));
                if #unitE > 0 then (
                    best := unitE#0;
                    for e in unitE do
                        if getVertexIndex getEdgeTarget e > getVertexIndex getEdgeTarget best
                        then best = e;
                    (matching, mk) = tryMatchEdge(best, matching, mk, tgtMap);
                );
            );
        );
    );
    matching
);

bmMatchingUp = method(TypicalValue => AcyclicMatching);
bmMatchingUp(ComplexGraph) := AcyclicMatching => cg ->
    makeAcyclicMatching(bmMatchingUpEdges getCGGraph cg, cg);
bmMatchingUp(CGGraph) := AcyclicMatching => g ->
    makeAcyclicMatching(bmMatchingUpEdges g, g);

bmMatchingUpEdges = g -> (
    byDeg := getGraphVerticesByDegree g; minD := getGraphMinDegree g;
    maxD  := getGraphMaxDegree g;        allE := getGraphEdges g;
    matching := {}; mk := set {}; tgtMap := new MutableHashTable;
    for d from minD to maxD-1 do (
        if byDeg#?d then (
            unmatched := select(byDeg#d, v -> not member(getVertexKey v, mk));
            for cand in unmatched do (
                unitE := select(allE, e ->
                    vertexEqual(getEdgeTarget e, cand) and isUnit(getEdgeWeight e)
                    and getEdgeSourceDegree e == d+1);
                if #unitE > 0 then (
                    best := unitE#0;
                    for e in unitE do
                        if getVertexIndex getEdgeSource e > getVertexIndex getEdgeSource best
                        then best = e;
                    if not member(getVertexKey getEdgeSource best, mk) then
                        (matching, mk) = tryMatchEdge(best, matching, mk, tgtMap);
                );
            );
        );
    );
    matching
);

prunedMatching = method(TypicalValue => AcyclicMatching);
prunedMatching(ComplexGraph) := AcyclicMatching => cg -> prunedMatching(getCGGraph cg, cg);
prunedMatching(CGGraph) := AcyclicMatching => g -> prunedMatching(g, g);
prunedMatching(CGGraph, Thing) := AcyclicMatching => (g, graphOrCG) -> (
    allEdges := getGraphEdges g;
    byTgt := new MutableHashTable;
    for e in allEdges do (
        src := getEdgeSource e;
        tgt := getEdgeTarget e;
        if getVertexDegree src != getVertexDegree tgt + 1 then continue;
        if not isUnit(getEdgeWeight e) then continue;
        tk := getVertexKey tgt;
        if not byTgt#?tk then byTgt#tk = {};
        byTgt#tk = append(byTgt#tk, e);
    );

    matchedKeys   := new MutableHashTable;
    matchingEdges := {};
    allTgts := sortByKey(
        select(getGraphVertices g, v -> byTgt#?(getVertexKey v)),
        v -> (getVertexDegree v, -getVertexIndex v));

    for tgt in allTgts do (
        tk := getVertexKey tgt;
        if matchedKeys#?tk then continue;
        candidates := select(byTgt#tk, e -> not matchedKeys#?(getVertexKey getEdgeSource e));
        if #candidates == 0 then continue;
        best := first sortByKey(candidates, e -> getVertexIndex getEdgeSource e);
        sk := getVertexKey getEdgeSource best;
        matchingEdges  = append(matchingEdges, best);
        matchedKeys#tk = true;
        matchedKeys#sk = true;
    );

    makeAcyclicMatching(matchingEdges, g)
);

-- multidegree algebra: join = lcm (componentwise max), leq = divisibility; prune subsets whose lcm is already attained
cubePruneCore = (n, gens, bot, join, leq) -> (
    live := new MutableHashTable;
    live#{} = bot;

    matched := new MutableHashTable;
    matchedPairs := {};

    pairJ := pair -> first toList(set(pair#0) - set(pair#1));

    for k from 0 to n-1 do (
        gk := gens#k;

        carryOver := {};
        for p in matchedPairs do (
            if pairJ p >= k then continue;
            tgt := p#1;
            if member(k, tgt) then continue;
            src := p#0;
            Sk := sort append(src, k);
            Tk := sort append(tgt, k);
            if matched#?Sk or matched#?Tk then continue;
            carryOver = append(carryOver, {Sk, Tk});
            matched#Sk = true;
            matched#Tk = true;
        );
        matchedPairs = matchedPairs | carryOver;

        spawn := {};
        for s in keys live do (
            if matched#?s then continue;
            sk := sort append(s, k);
            if matched#?sk then continue;
            spawn = append(spawn, (sk, join(live#s, gk)));
        );
        for pr in spawn do live#(pr#0) = pr#1;

        for j from 0 to k do (
            snap := keys live;
            gj := gens#j;
            for s in snap do (
                if not live#?s or matched#?s then continue;
                if j == k then (
                    if member(k, s) then continue;
                    sk := sort append(s, k);
                    if not live#?sk or matched#?sk then continue;
                    if leq(gk, live#s) then (
                        matchedPairs = append(matchedPairs, {sk, s});
                        matched#s = true;
                        matched#sk = true;
                    );
                ) else (
                    if not member(k, s) then continue;
                    if member(j, s) then continue;
                    sj := sort append(s, j);
                    if not live#?sj or matched#?sj then continue;
                    if leq(gj, live#s) then (
                        matchedPairs = append(matchedPairs, {sj, s});
                        matched#s = true;
                        matched#sj = true;
                    );
                );
            );
        );

        for s in keys live do if matched#?s then remove(live, s);
    );
    (matchedPairs, live)
);

-- a subset's multidegree is the lcm of its generators, carried as an exponent vector;
-- support alone would only be correct for squarefree generators
cubeMdOps = (genList, R) -> (
    nVars := numgens R;
    expV := for g in genList list flatten exponents g;
    bot  := toList(nVars : 0);
    join := (md, gk) -> for i from 0 to nVars - 1 list max(md#i, gk#i);
    leq  := (gk, md) -> all(nVars, i -> gk#i <= md#i);
    (expV, bot, join, leq)
    );

cubePrunedBetti = method(TypicalValue => BettiTally,
    Options => {ReturnMatching => false});
cubePrunedBetti(List, Ring) := opts -> (genList, R) -> (
    n := #genList;
    (expV, bot, join, leq) := cubeMdOps(genList, R);
    (matchedPairs, live) := cubePruneCore(n, expV, bot, join, leq);

    btMut := new MutableHashTable;
    for s in keys live do (
        i := #s;
        alpha := live#s;
        j := sum alpha;
        key := (i, alpha, j);
        btMut#key = (if btMut#?key then btMut#key else 0) + 1;
    );
    bt := new BettiTally from pairs btMut;

    if not opts.ReturnMatching then return bt;

    pd := if # keys live == 0 then 0
          else max apply(keys live, s -> #s);
    cutoff := pd + 1;
    edgesOut := for p in matchedPairs list (
        if #(p#0) <= cutoff then p else continue
    );
    (bt, edgesOut)
);

cubePrunedMatching = method(TypicalValue => HashTable);
cubePrunedMatching(List, Ring) := HashTable => (genList, R) -> (
    n := #genList;
    (expV, bot, join, leq) := cubeMdOps(genList, R);
    (matchedPairs, live) := cubePruneCore(n, expV, bot, join, leq);
    new HashTable from {
        "matching"    => matchedPairs,
        "critical"    => sort keys live,
        "multidegree" => new HashTable from for s in keys live list (s => live#s)
    }
);

cubePrunedResolutionPrimes = {2, 3, 5, 7, 11, 13};

cubeMCCCells = argSeq -> (
    (a, ringOrFn, b) := argSeq;
    legacy := instance(a, ZZ);
    n := if legacy then a else #a;
    mdeg := if legacy then ringOrFn else (
        (expV, bot, join, leq) := cubeMdOps(a, ringOrFn);
        S -> fold(join, bot, apply(S, j -> expV#j)));
    cells := for S in subsets n list (if mdeg S === b then sort S else continue);
    bySize := new MutableHashTable;
    for S in cells do bySize#(#S) = (if bySize#?(#S) then bySize#(#S) else {}) | {S};
    degs := sort keys bySize;
    shift := if #degs == 0 then 0 else min degs;
    indexOf := new MutableHashTable;
    for k in degs do (
        h := new MutableHashTable;
        L := bySize#k;
        for t from 0 to #L - 1 do h#(L#t) = t;
        indexOf#k = h;
    );
    (bySize, degs, shift, indexOf)
);

cubeMCCComplex = (bySize, degs, shift, indexOf) -> (
    mfc := makeMutableFreeComplex(for k in degs list (k - shift, #(bySize#k)), QQ);
    for k in degs do if indexOf#?(k-1) then (
        L := bySize#k;
        for c from 0 to #L - 1 do (
            S := L#c;
            for t from 0 to #S - 1 do (
                F := drop(S, {t, t});
                if (indexOf#(k-1))#?F then setMFCEntry(mfc, new HashTable from {
                    "d" => k - shift, "row" => (indexOf#(k-1))#F, "col" => c, "val" => (-1)^t});
            );
        );
    );
    mfc
);

cubePrunedResolution = method(TypicalValue => HashTable);
-- each surviving multidegree contributes its mcc homology to Tor(R/I,k); the SCC determinant carries the torsion
cubePrunedResolution(List, Ring) := HashTable => (genList, R) -> (
    cm := cubePrunedMatching(genList, R);

    critByMd := new MutableHashTable;
    for S in cm#"critical" do (
        b := (cm#"multidegree")#S;
        critByMd#b = (if critByMd#?b then critByMd#b else {}) | {S};
    );

    ranksQ := new MutableHashTable;
    badPrimes := set {};
    sccs := {};

    for b in select(keys critByMd, b -> #(critByMd#b) == 1) do (
        S := first critByMd#b;
        ranksQ#(#S) = 1 + (if ranksQ#?(#S) then ranksQ#(#S) else 0);
    );

    for b in select(keys critByMd, b -> #(critByMd#b) > 1) do (
        (bySize, degs, shift, indexOf) := cubeMCCCells(genList, R, b);

        bdry := new MutableHashTable;
        for k in degs do bdry#k = (
            if not indexOf#?(k-1) then map(ZZ^0, ZZ^(#(bySize#k)), 0)
            else (
                L := bySize#k;
                M := mutableMatrix(ZZ, #(bySize#(k-1)), #L);
                for c from 0 to #L - 1 do (
                    S := L#c;
                    for t from 0 to #S - 1 do (
                        F := drop(S, {t, t});
                        if (indexOf#(k-1))#?F then M_((indexOf#(k-1))#F, c) = (-1)^t;
                    );
                );
                matrix M
            )
        );
        rkQ := new MutableHashTable;
        for k in degs do rkQ#k = if numColumns bdry#k == 0 or numRows bdry#k == 0 then 0 else rank bdry#k;

        for k in degs do (
            bk := #(bySize#k) - rkQ#k - (if rkQ#?(k+1) then rkQ#(k+1) else 0);
            ranksQ#k = bk + (if ranksQ#?k then ranksQ#k else 0);
        );

        for k in degs do (
            if numColumns bdry#k == 0 or numRows bdry#k == 0 then continue;
            sccBad := for p in cubePrunedResolutionPrimes list (
                if rank mutableMatrix(bdry#k ** (ZZ/p)) < rkQ#k then p else continue);
            if #sccBad == 0 then continue;
            badPrimes = badPrimes + set sccBad;
            sccs = append(sccs, new HashTable from {
                "lowerDeg"    => k - 1,
                "upperDeg"    => k,
                "det"         => if numRows bdry#k == numColumns bdry#k then det bdry#k else null,
                "cokernel"    => prune coker bdry#k,
                "badPrimes"   => sccBad,
                "multidegree" => b});
        );
    );

    hi := if #(cm#"critical") == 0 then 0 else max apply(cm#"critical", S -> #S);
    rawRanks := for k from 0 to hi list (if ranksQ#?k then ranksQ#k else 0);
    while #rawRanks > 1 and last rawRanks == 0 do rawRanks = drop(rawRanks, -1);
    new HashTable from {
        "ranks"     => rawRanks,
        "badPrimes" => sort toList badPrimes,
        "sccs"    => sccs
    }
);

gradientPaths = method(TypicalValue => List);
gradientPaths(CGGraph, CGVertex, CGVertex) := List => (g, src, tgt) -> (
    if vertexEqual(src, tgt) then return {{}};
    adj := new MutableHashTable;
    for v in getGraphVertices g do adj#(getVertexKey v) = {};
    for e in getGraphEdges g do (
        sk := getVertexKey getEdgeSource e;
        adj#sk = append(adj#sk, e);
    );

    tgtKey := getVertexKey tgt;
    paths := {};
    stack := {(src, {}, set {getVertexKey src})};

    while #stack > 0 do (
        top := last stack; stack = drop(stack, -1);
        cur := top#0; path := top#1; visited := top#2;
        curKey := getVertexKey cur;
        outEdges := if adj#?curKey then adj#curKey else {};
        for e in outEdges do (
            nxtKey := getVertexKey getEdgeTarget e;
            if member(nxtKey, visited) then continue;
            newPath := append(path, e);
            if nxtKey == tgtKey then paths = append(paths, newPath)
            else stack = append(stack, (getEdgeTarget e, newPath, visited + set {nxtKey}));
        );
    );
    paths
);
gradientPaths(ComplexGraph, CGVertex, CGVertex) := List => (cg, s, t) ->
    gradientPaths(getCGGraph cg, s, t);

nontrivialGradientPaths = method(TypicalValue => List);
nontrivialGradientPaths(CGGraph, CGVertex, CGVertex) := List => (g, s, t) -> (
    allP := gradientPaths(g, s, t);
    for p in allP list if #p > 0 then (p, product for e in p list getEdgeWeight e) else continue
);

computeGamma = method();
computeGamma(CGGraph, CGVertex, CGVertex) := (g, src, tgt) -> (
    stripped := stripEdgeWeights g;
    intSum := (
        allP := gradientPaths(stripped, src, tgt);
        if #allP == 0 then 0
        else sum for p in allP list product for e in p list getEdgeWeight e
    );
    if intSum == 0 then return 0;
    srcWt := getVertexWeight src;
    tgtWt := getVertexWeight tgt;
    if srcWt === null or tgtWt === null or tgtWt == 0 then return intSum;
    sub(intSum, ring srcWt) * srcWt // tgtWt
);
computeGamma(ComplexGraph, CGVertex, CGVertex) := (cg, src, tgt) ->
    computeGamma(getCGGraph cg, src, tgt);

reachableDegreeOne = method(TypicalValue => List);
reachableDegreeOne(CGGraph, CGVertex) := List => (g, v) -> (
    select(getGraphVerticesAtDegree(g, 1), t -> #gradientPaths(g, v, t) > 0)
);
reachableDegreeOne(ComplexGraph, CGVertex) := List => (cg, v) ->
    reachableDegreeOne(getCGGraph cg, v);

gradientPathSummary = method(TypicalValue => List);
gradientPathSummary(CGGraph, CGVertex, CGVertex) := List => (g, src, tgt) -> (
    ntp := nontrivialGradientPaths(g, src, tgt);
    for pw in ntp list (
        p  := pw#0;
        wt := pw#1;
        toSortedList := lbl -> sort toList lbl;
        labels := {toSortedList getVertexLabel(getEdgeSource(p#0))};
        for e in p do labels = append(labels, toSortedList getVertexLabel(getEdgeTarget e));
        append(labels, wt)
    )
);
gradientPathSummary(ComplexGraph, CGVertex, CGVertex) := List => (cg, s, t) ->
    gradientPathSummary(getCGGraph cg, s, t);

GammaMatrixDown = method(TypicalValue => Matrix);
GammaMatrixDown(CGGraph, List, ZZ) := Matrix => (flippedG, matchEdges, i) -> (
    allVerts := sortByKey(getGraphVerticesAtDegree(flippedG, i), v -> getVertexIndex v);
    matchedKeys := set flatten for e in matchEdges list
        {getVertexKey getEdgeSource e, getVertexKey getEdgeTarget e};
    critVerts := select(allVerts, v -> not member(getVertexKey v, matchedKeys));
    critVerts = sortByKey(critVerts, v -> vertexLabelSortKey v);
    m := #critVerts;
    n := #allVerts;
    if m == 0 or n == 0 then return map(QQ^m, QQ^n, 0);
    R := null;
    for e in getGraphEdges flippedG do (
        w := getEdgeWeight e;
        if instance(w, RingElement) then (R = ring w; break;);
    );
    if R === null then R = QQ;
    M := mutableMatrix(R, m, n);
    for col from 0 to n - 1 do (
        S := allVerts#col;
        for row from 0 to m - 1 do (
            X := critVerts#row;
            gamma := computeGamma(flippedG, S, X);
            if gamma != 0 then M_(row, col) = sub(gamma, R);
        );
    );
    matrix M
);
GammaMatrixDown(ComplexGraph, List, ZZ) := Matrix => (cg, matchEdges, i) -> (
    flippedG := flipGraphEdges(getCGGraph cg, matchEdges);
    GammaMatrixDown(flippedG, matchEdges, i)
);
GammaMatrixDown(ComplexGraph, AcyclicMatching, ZZ) := Matrix => (cg, m, i) ->
    GammaMatrixDown(cg, getMatchingEdges m, i);

GammaMatrixUp = method(TypicalValue => Matrix);
GammaMatrixUp(CGGraph, List, ZZ) := Matrix => (flippedG, matchEdges, i) -> (
    allVerts := sortByKey(getGraphVerticesAtDegree(flippedG, i), v -> getVertexIndex v);
    matchedKeys := set flatten for e in matchEdges list
        {getVertexKey getEdgeSource e, getVertexKey getEdgeTarget e};
    critVerts := select(allVerts, v -> not member(getVertexKey v, matchedKeys));
    critVerts = sortByKey(critVerts, v -> vertexLabelSortKey v);
    m := #critVerts;
    n := #allVerts;
    if m == 0 or n == 0 then return map(QQ^n, QQ^m, 0);
    R := null;
    for e in getGraphEdges flippedG do (
        w := getEdgeWeight e;
        if instance(w, RingElement) then (R = ring w; break;);
    );
    if R === null then R = QQ;
    M := mutableMatrix(R, n, m);
    for col from 0 to m - 1 do (
        X := critVerts#col;
        for row from 0 to n - 1 do (
            S := allVerts#row;
            gamma := computeGamma(flippedG, X, S);
            if gamma != 0 then M_(row, col) = sub(gamma, R);
        );
    );
    matrix M
);
GammaMatrixUp(ComplexGraph, List, ZZ) := Matrix => (cg, matchEdges, i) -> (
    flippedG := flipGraphEdges(getCGGraph cg, matchEdges);
    GammaMatrixUp(flippedG, matchEdges, i)
);
GammaMatrixUp(ComplexGraph, AcyclicMatching, ZZ) := Matrix => (cg, m, i) ->
    GammaMatrixUp(cg, getMatchingEdges m, i);

reindexCriticalVertices = (sortedByDeg, degs) -> (
    flatten for d in degs list (
        sorted := sortedByDeg#d;
        for i from 0 to #sorted - 1 list (
            ov := sorted#i;
            makeCGVertex(d, i, getVertexWeight ov, getVertexLabel ov)
        )
    )
);

buildAdjListFromGraph = (flippedGraph) -> (
    ht := new MutableHashTable;
    for e in getGraphEdges flippedGraph do (
        sk := getVertexKey getEdgeSource e;
        tk := getVertexKey getEdgeTarget e;
        wt := intEdgeCoeff e;
        if not ht#?sk then ht#sk = {};
        ht#sk = append(ht#sk, (tk, wt));
    );
    ht
);

reduceComplexGraph = method(TypicalValue => mGrdComplexGraph);
reduceComplexGraph(ComplexGraph, List) := mGrdComplexGraph => (cg, matchEdges) -> (
    << "[reduceComplexGraph] Reducing with " << #matchEdges << " matching edges" << endl;
    R := getCGRing cg;
    flipped := flipGraphEdges(getCGGraph cg, matchEdges);
    crits := criticalVertices(cg, matchEdges);
    << "[reduceComplexGraph] Critical vertices: " << #crits << endl;
    critByDeg := partition(v -> getVertexDegree v, crits);
    critDegs := sort keys critByDeg;
    if #critDegs == 0 then return buildMGrdComplexGraph(makeCGGraph({}, {}), makeMutableFreeComplex({(0,0)}, R), R);
    sortedByDeg := new MutableHashTable;
    posLookup := new MutableHashTable;
    for d in critDegs do (
        sorted := sortByKey(critByDeg#d, v -> vertexLabelSortKey v);
        sortedByDeg#d = sorted;
        for i from 0 to #sorted - 1 do posLookup#(getVertexKey sorted#i) = i;
    );
    reducedMFC := makeMutableFreeComplex(for d in critDegs list (d, #(sortedByDeg#d)), R);
    degreesWithDiffs := select(critDegs, d -> critByDeg#?(d-1));

    adjList := buildAdjListFromGraph(flipped);

    posLookupHT := new HashTable from pairs posLookup;

    vtxWeights := new MutableHashTable;
    for v in getGraphVertices flipped do
        vtxWeights#(getVertexKey v) = getVertexWeight v;
    vtxWeightsHT := new HashTable from pairs vtxWeights;

    n := if #(getGraphVertices getCGGraph cg) > 0
         then max apply(getGraphVertices getCGGraph cg, v -> getVertexDegree v)
         else 1;
    numProcs := max(1, allowableThreads);
    allTasks := {};
    for d in degreesWithDiffs do (
        hiKeys := apply(sortedByDeg#d, v -> getVertexKey v);
        loKeys := apply(sortedByDeg#(d-1), v -> getVertexKey v);
        loKeySet := new HashTable from for lk in loKeys list lk => posLookupHT#lk;
        numCols := #hiKeys;
        maxT := if n <= 1 then 1
                else min(numCols, min(ceiling(numProcs/3),
                        ceiling((1-d)*(d-n) + (n-2_QQ)*(d-1)/(n-1) + 1)));
        chunkSz := max(1, ceiling(numCols / maxT));
        for i from 0 to (numCols - 1) // chunkSz do (
            startIdx := i * chunkSz;
            endIdx := min(numCols - 1, (i + 1) * chunkSz - 1);
            colKeys := hiKeys_{startIdx..endIdx};
            allTasks = append(allTasks,
                (d, schedule(computeColumnChunkKeys,
                    (adjList, colKeys, posLookupHT, loKeySet))));
        );
    );

    for taskPair in allTasks do (
        d := taskPair#0;
        chunkResults := taskResult taskPair#1;
        hiVerts := sortedByDeg#d;
        loVerts := sortedByDeg#(d-1);
        for colData in chunkResults do (
            cIdx := colData#0;
            entries := colData#1;
            srcKey := getVertexKey hiVerts#cIdx;
            srcWt := vtxWeightsHT#srcKey;
            for entry in entries do (
                rIdx     := entry#0;
                intGamma := entry#1;
                tgtKey   := getVertexKey loVerts#rIdx;
                tgtWt    := vtxWeightsHT#tgtKey;
                val := if srcWt =!= null and tgtWt =!= null and tgtWt != 0
                    then promote(intGamma, R) * srcWt // tgtWt
                    else promote(intGamma, R);
                if val != 0 then
                    setMFCEntry(reducedMFC, new HashTable from {"d"=>d, "row"=>rIdx, "col"=>cIdx, "val"=>val});
            );
        );
    );

    reVerts := reindexCriticalVertices(sortedByDeg, critDegs);
    reByDeg := partition(v -> getVertexDegree v, reVerts);
    reEdges := select(flatten for d in critDegs list (
        if not critByDeg#?(d-1) then {} else (
            hi := reByDeg#d; lo := reByDeg#(d-1);
            dff := getMFCDifferential(reducedMFC, d);
            if dff === null then {} else
                flatten for c from 0 to #hi-1 list for r from 0 to #lo-1 list (
                    v := dff_(r,c); if v != 0 then makeCGEdge(hi#c, lo#r, v) else null
                )
        )
    ), e -> e =!= null);
    << "[reduceComplexGraph] Done: " << #reVerts << " vertices, " << #reEdges << " edges" << endl;
    buildMGrdComplexGraph(makeCGGraph(reVerts, reEdges), reducedMFC, R)
);
reduceComplexGraph(ComplexGraph, AcyclicMatching) := mGrdComplexGraph => (cg, m) ->
    reduceComplexGraph(cg, getMatchingEdges m);

