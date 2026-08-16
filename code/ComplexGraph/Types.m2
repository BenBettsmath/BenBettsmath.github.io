protect symbol weight
protect symbol label
protect symbol vertices
protect symbol edges
protect symbol ranks
protect symbol modules
protect symbol minDeg
protect symbol maxDeg
protect symbol diffs
protect symbol graph
protect symbol mfc
protect symbol vertPos
protect symbol multidegree
protect symbol matchedKeys
protect symbol edgeTable
protect symbol isHomogeneous
protect symbol isAcyclic
protect symbol isMorse
protect symbol dbPath
protect symbol gens
protect symbol matchPairs
protect symbol matchedSubsets
protect symbol numGens
protect symbol state

lexSubsets = (n, k) -> (
    if k == 0 then return {{}};
    if k > n  then return {};
    withFirst    := for s in lexSubsets(n-1, k-1) list
                        prepend(0, for x in s list x+1);
    withoutFirst := for s in lexSubsets(n-1, k)   list
                        (for x in s list x+1);
    withFirst | withoutFirst
);

buildSubsetIndex = (n, d) -> (
    subs := lexSubsets(n, d);
    tbl  := new MutableHashTable;
    for i from 0 to #subs - 1 do tbl#(subs#i) = i;
    new HashTable from pairs tbl
);

lexSubsetAtIndex = (n, d, idx) -> (
    if d == 0 then return {};
    if d == n then return toList(0..n-1);
    c := binomial(n-1, d-1);
    if idx < c then
        prepend(0, for x in lexSubsetAtIndex(n-1, d-1, idx) list x+1)
    else
        for x in lexSubsetAtIndex(n-1, d, idx - c) list x+1
);

expVecLcm = (a, b) -> for i from 0 to #a-1 list max(a#i, b#i);

expVecDiv = (a, b) -> for i from 0 to #a-1 list a#i - b#i;

computeTaylorChunkR = (expVecs, d, n, nVars, colStart, colEnd, rIdx, R) -> (
    zeroVec := toList(nVars : 0);
    flatten for col from colStart to colEnd-1 list (
        S := lexSubsetAtIndex(n, d, col);
        lcmS := expVecs#(S#0);
        for i from 1 to #S-1 do lcmS = expVecLcm(lcmS, expVecs#(S#i));
        for pos from 0 to d-1 list (
            Sm := drop(S, {pos, pos});
            lcmSm := if #Sm == 0 then zeroVec
                else (tmp := expVecs#(Sm#0); for i from 1 to #Sm-1 do tmp = expVecLcm(tmp, expVecs#(Sm#i)); tmp);
            (rIdx#Sm, col) => ((-1)^(d + pos + 1) * R_(expVecDiv(lcmS, lcmSm)))
        )
    )
);

expVecToString = v -> demark(" ", for x in v list toString x);

stringToExpVec = s -> for t in separate(" ", s) list value t;

sortByKey = (inputList, keyFunction) -> (
    if #inputList == 0 then return inputList;
    keyedPairs := apply(inputList, element -> (keyFunction element, element));
    sortedPairs := sort keyedPairs;
    apply(sortedPairs, pair -> pair#1)
);

CGVertex = new Type of HashTable;

makeCGVertex = method(TypicalValue => CGVertex);
makeCGVertex(ZZ, ZZ) := CGVertex => (deg, idx) -> (
    new CGVertex from {symbol degree => deg, symbol index => idx, symbol weight => null, symbol label => null}
);
makeCGVertex(ZZ, ZZ, Thing) := CGVertex => (deg, idx, wt) -> (
    new CGVertex from {symbol degree => deg, symbol index => idx, symbol weight => wt, symbol label => null}
);
makeCGVertex(ZZ, ZZ, Thing, Thing) := CGVertex => (deg, idx, wt, lab) -> (
    new CGVertex from {symbol degree => deg, symbol index => idx, symbol weight => wt, symbol label => lab}
);

getVertexDegree = method(TypicalValue => ZZ);
getVertexDegree(CGVertex) := ZZ => v -> v.degree;

getVertexIndex = method(TypicalValue => ZZ);
getVertexIndex(CGVertex) := ZZ => v -> v.index;

getVertexWeight = method();
getVertexWeight(CGVertex) := v -> v.weight;

getVertexLabel = method();
getVertexLabel(CGVertex) := v -> v.label;

getVertexKey = method(TypicalValue => List);
getVertexKey(CGVertex) := List => v -> {getVertexDegree v, getVertexIndex v};

isWeighted = method(TypicalValue => Boolean);
isWeighted(CGVertex) := Boolean => v -> v.weight =!= null;

isLabeled = method(TypicalValue => Boolean);
isLabeled(CGVertex) := Boolean => v -> v.label =!= null;

addWeight = method(TypicalValue => CGVertex);
addWeight(CGVertex, Thing) := CGVertex => (v, w) -> makeCGVertex(getVertexDegree v, getVertexIndex v, w, getVertexLabel v);

addLabel = method(TypicalValue => CGVertex);
addLabel(CGVertex, Thing) := CGVertex => (v, l) -> makeCGVertex(getVertexDegree v, getVertexIndex v, getVertexWeight v, l);

addWeightAndLabel = method(TypicalValue => CGVertex);
addWeightAndLabel(CGVertex, Thing, Thing) := CGVertex => (v, w, l) -> makeCGVertex(getVertexDegree v, getVertexIndex v, w, l);

stripWeight = method(TypicalValue => CGVertex);
stripWeight(CGVertex) := CGVertex => v -> makeCGVertex(getVertexDegree v, getVertexIndex v, null, getVertexLabel v);

stripLabel = method(TypicalValue => CGVertex);
stripLabel(CGVertex) := CGVertex => v -> makeCGVertex(getVertexDegree v, getVertexIndex v, getVertexWeight v, null);

stripDecorations = method(TypicalValue => CGVertex);
stripDecorations(CGVertex) := CGVertex => v -> makeCGVertex(getVertexDegree v, getVertexIndex v);

vertexEqual = (a, b) -> getVertexDegree a == getVertexDegree b and getVertexIndex a == getVertexIndex b;

net CGVertex := v -> (
    base := "v(" | toString(getVertexDegree v) | "," | toString(getVertexIndex v) | ")";
    wStr := if isWeighted v then " wt=" | toString(getVertexWeight v) else "";
    lStr := if isLabeled v then " lb=" | toString(getVertexLabel v) else "";
    net("{" | base | wStr | lStr | "}")
);

CGEdge = new Type of HashTable;

makeCGEdge = method(TypicalValue => CGEdge);
makeCGEdge(CGVertex, CGVertex, Thing) := CGEdge => (src, tgt, wt) -> (
    new CGEdge from {symbol source => src, symbol target => tgt, symbol weight => wt}
);
makeCGEdge(List, List, Thing) := CGEdge => (srcKey, tgtKey, wt) -> (
    makeCGEdge(makeCGVertex(srcKey#0, srcKey#1), makeCGVertex(tgtKey#0, tgtKey#1), wt)
);

getEdgeSource = method(TypicalValue => CGVertex);
getEdgeSource(CGEdge) := CGVertex => e -> e.source;

getEdgeTarget = method(TypicalValue => CGVertex);
getEdgeTarget(CGEdge) := CGVertex => e -> e.target;

getEdgeWeight = method();
getEdgeWeight(CGEdge) := e -> e.weight;

getEdgeSourceDegree = method(TypicalValue => ZZ);
getEdgeSourceDegree(CGEdge) := ZZ => e -> getVertexDegree getEdgeSource e;

getEdgeTargetDegree = method(TypicalValue => ZZ);
getEdgeTargetDegree(CGEdge) := ZZ => e -> getVertexDegree getEdgeTarget e;

setEdgeWeight = method(TypicalValue => CGEdge);
setEdgeWeight(CGEdge, Thing) := CGEdge => (e, w) ->
    makeCGEdge(getEdgeSource e, getEdgeTarget e, w);

flipEdge = method(TypicalValue => CGEdge);
flipEdge(CGEdge) := CGEdge => e -> (
    w := getEdgeWeight e;
    if not isUnit w then error("flipEdge: weight " | toString w | " is not a unit");
    newWt := -1 / w;
    if instance(w, RingElement) then newWt = try lift(newWt, ring w) else newWt;
    makeCGEdge(getEdgeTarget e, getEdgeSource e, newWt)
);

edgeEqual = (a, b) -> (
    vertexEqual(getEdgeSource a, getEdgeSource b)
    and vertexEqual(getEdgeTarget a, getEdgeTarget b)
    and (
        wa := getEdgeWeight a; wb := getEdgeWeight b;
        class wa === class wb and try (wa == wb) else false
    )
);

edgeEndpointsEqual = (a, b) -> (
    vertexEqual(getEdgeSource a, getEdgeSource b)
    and vertexEqual(getEdgeTarget a, getEdgeTarget b)
);

net CGEdge := e -> (
    net("{" | net(getEdgeSource e) | " --[" | toString(getEdgeWeight e) | "]--> " | net(getEdgeTarget e) | "}")
);

intEdgeCoeff = (e) -> (
    w := getEdgeWeight e;
    if instance(w, ZZ) then w
    else if instance(w, QQ) then (
        if w > 0 then 1 else if w < 0 then -1 else 0
    ) else (
        try (
            lc := leadCoefficient w;
            lcZ := lift(lc, ZZ);
            p := char ring w;
            if p > 0 and lcZ > p // 2 then lcZ - p else lcZ
        ) else (
            try (if w > 0 then 1 else if w < 0 then -1 else 0) else 0
        )
    )
);

stripEdgeWeight = method(TypicalValue => CGEdge);
stripEdgeWeight(CGEdge) := CGEdge => e -> (
    coeff := intEdgeCoeff e;
    setEdgeWeight(e, if coeff > 0 then 1 else if coeff < 0 then -1 else 0)
);

CGGraph = new Type of HashTable;

makeCGGraph = method(TypicalValue => CGGraph);
makeCGGraph(List, List) := CGGraph => (verts, edgs) -> (
    new CGGraph from {symbol vertices => verts, symbol edges => edgs}
);

getGraphVertices = method(TypicalValue => List);
getGraphVertices(CGGraph) := List => g -> g.vertices;

getGraphEdges = method(TypicalValue => List);
getGraphEdges(CGGraph) := List => g -> g.edges;

getGraphVertexCount = method(TypicalValue => ZZ);
getGraphVertexCount(CGGraph) := ZZ => g -> #(getGraphVertices g);

getGraphEdgeCount = method(TypicalValue => ZZ);
getGraphEdgeCount(CGGraph) := ZZ => g -> #(getGraphEdges g);

getGraphVerticesByDegree = method(TypicalValue => HashTable);
getGraphVerticesByDegree(CGGraph) := HashTable => g -> partition(v -> getVertexDegree v, getGraphVertices g);

getGraphVerticesAtDegree = method(TypicalValue => List);
getGraphVerticesAtDegree(CGGraph, ZZ) := List => (g, d) -> select(getGraphVertices g, v -> getVertexDegree v == d);

getGraphMinDegree = method(TypicalValue => ZZ);
getGraphMinDegree(CGGraph) := ZZ => g -> min apply(getGraphVertices g, v -> getVertexDegree v);

getGraphMaxDegree = method(TypicalValue => ZZ);
getGraphMaxDegree(CGGraph) := ZZ => g -> max apply(getGraphVertices g, v -> getVertexDegree v);

getOutgoingEdges = method(TypicalValue => List);
getOutgoingEdges(CGGraph, CGVertex) := List => (g, v) -> select(getGraphEdges g, e -> vertexEqual(getEdgeSource e, v));

getIncomingEdges = method(TypicalValue => List);
getIncomingEdges(CGGraph, CGVertex) := List => (g, v) -> select(getGraphEdges g, e -> vertexEqual(getEdgeTarget e, v));

getOutgoingVertices = method(TypicalValue => List);
getOutgoingVertices(CGGraph, CGVertex) := List => (g, v) -> apply(getOutgoingEdges(g, v), e -> getEdgeTarget e);

getIncomingVertices = method(TypicalValue => List);
getIncomingVertices(CGGraph, CGVertex) := List => (g, v) -> apply(getIncomingEdges(g, v), e -> getEdgeSource e);

findVertexByKey = method();
findVertexByKey(CGGraph, List) := (g, key) -> (
    result := select(getGraphVertices g, v -> getVertexKey v == key);
    if #result > 0 then result#0 else null
);

findVertexByLabel = method();
findVertexByLabel(CGGraph, Thing) := (g, lab) -> (
    result := select(getGraphVertices g, v -> isLabeled v and getVertexLabel v === lab);
    if #result > 0 then result#0 else null
);

hasEdge = method(TypicalValue => Boolean);
hasEdge(CGGraph, CGVertex, CGVertex) := Boolean => (g, src, tgt) -> (
    any(getGraphEdges g, e -> vertexEqual(getEdgeSource e, src) and vertexEqual(getEdgeTarget e, tgt))
);

edgesBetweenDegrees = method(TypicalValue => List);
edgesBetweenDegrees(CGGraph, ZZ, ZZ) := List => (g, srcDeg, tgtDeg) -> (
    select(getGraphEdges g, e -> getEdgeSourceDegree e == srcDeg and getEdgeTargetDegree e == tgtDeg)
);

subgraph = method(TypicalValue => CGGraph);
subgraph(CGGraph, List) := CGGraph => (g, vertexSubset) -> (
    subKeys := set apply(vertexSubset, v -> getVertexKey v);
    subEdges := select(getGraphEdges g, e ->
        member(getVertexKey getEdgeSource e, subKeys) and member(getVertexKey getEdgeTarget e, subKeys));
    makeCGGraph(vertexSubset, subEdges)
);

flipGraphEdges = method(TypicalValue => CGGraph);
flipGraphEdges(CGGraph, List) := CGGraph => (g, matchingEdges) -> (
    isMatched := e -> any(matchingEdges, m -> edgeEqual(m, e));
    newEdges := for e in getGraphEdges g list (if isMatched e then flipEdge e else e);
    makeCGGraph(getGraphVertices g, newEdges)
);

addGraphVertexWeights = method(TypicalValue => CGGraph);
addGraphVertexWeights(CGGraph, HashTable) := CGGraph => (g, wTable) -> (
    newVerts := for v in getGraphVertices g list (
        k := getVertexKey v; if wTable#?k then addWeight(v, wTable#k) else v);
    makeCGGraph(newVerts, getGraphEdges g)
);

addGraphVertexLabels = method(TypicalValue => CGGraph);
addGraphVertexLabels(CGGraph, HashTable) := CGGraph => (g, lTable) -> (
    newVerts := for v in getGraphVertices g list (
        k := getVertexKey v; if lTable#?k then addLabel(v, lTable#k) else v);
    makeCGGraph(newVerts, getGraphEdges g)
);

addEdges = method(TypicalValue => CGGraph);
addEdges(CGGraph, List) := CGGraph => (g, newEdges) -> (
    makeCGGraph(getGraphVertices g, getGraphEdges g | newEdges)
);

stripEdgeWeights = method();
stripEdgeWeights(CGGraph) := CGGraph => g -> (
    makeCGGraph(getGraphVertices g, apply(getGraphEdges g, e -> stripEdgeWeight e))
);

net CGGraph := g -> (
    net("CGGraph(" | toString(getGraphVertexCount g) | " vertices, " | toString(getGraphEdgeCount g) | " edges)")
);

MutableFreeComplex = new Type of MutableHashTable;

makeMutableFreeComplex = method(TypicalValue => MutableFreeComplex);
makeMutableFreeComplex(List, Ring) := MutableFreeComplex => (rankList, ambRing) -> (
    mfc := new MutableFreeComplex;
    mfc.ring = ambRing;
    rankTable   := new MutableHashTable;
    moduleTable := new MutableHashTable;
    for pair in rankList do (
        rankTable#(pair#0)   = pair#1;
        moduleTable#(pair#0) = ambRing^(pair#1);
    );
    mfc.ranks   = rankTable;
    mfc.modules = moduleTable;
    sortedDegs := sort keys rankTable;
    mfc.minDeg = min sortedDegs;
    mfc.maxDeg = max sortedDegs;
    diffTable := new MutableHashTable;
    for i from 1 to #sortedDegs - 1 do (
        d := sortedDegs#i;
        dPrev := sortedDegs#(i-1);
        diffTable#d = mutableMatrix(ambRing, rankTable#dPrev, rankTable#d);
    );
    mfc.diffs = diffTable;
    mfc
);

getMFCRing = method(TypicalValue => Ring);
getMFCRing(MutableFreeComplex) := Ring => mfc -> mfc.ring;
getMFCMinDegree = method(TypicalValue => ZZ);
getMFCMinDegree(MutableFreeComplex) := ZZ => mfc -> mfc.minDeg;
getMFCMaxDegree = method(TypicalValue => ZZ);
getMFCMaxDegree(MutableFreeComplex) := ZZ => mfc -> mfc.maxDeg;
getMFCRank = method(TypicalValue => ZZ);
getMFCRank(MutableFreeComplex, ZZ) := ZZ => (mfc, d) -> (
    rt := mfc.ranks; if rt#?d then rt#d else 0);
getMFCModule = method();
getMFCModule(MutableFreeComplex, ZZ) := (mfc, d) -> (
    mt := mfc.modules; if mt#?d then mt#d else (getMFCRing mfc)^0);
getMFCDifferential = method();
getMFCDifferential(MutableFreeComplex, ZZ) := (mfc, d) -> (
    dt := mfc.diffs; if dt#?d then dt#d else null);
getMFCEntry = method();
getMFCEntry(MutableFreeComplex, HashTable) := (mfc, p) -> (
    dff := getMFCDifferential(mfc, p#"d");
    if dff === null then error("getMFCEntry: no differential at degree " | toString p#"d");
    dff_(p#"row", p#"col")
);
mfcMatrixAt = method();
mfcMatrixAt(MutableFreeComplex, ZZ) := (mfc, d) -> (
    dff := getMFCDifferential(mfc, d);
    if dff === null then null else matrix dff);
mfcRankList = method(TypicalValue => List);
mfcRankList(MutableFreeComplex) := List => mfc -> (
    lo := getMFCMinDegree mfc; hi := getMFCMaxDegree mfc;
    for d from lo to hi list (d, getMFCRank(mfc, d)));

setMFCEntry = method();
setMFCEntry(MutableFreeComplex, HashTable) := (mfc, p) -> (
    dff := getMFCDifferential(mfc, p#"d");
    if dff === null then error("setMFCEntry: no differential at degree " | toString p#"d");
    dff_(p#"row", p#"col") = sub(p#"val", getMFCRing mfc);
);
addToMFCEntry = method();
addToMFCEntry(MutableFreeComplex, HashTable) := (mfc, p) -> (
    dff := getMFCDifferential(mfc, p#"d");
    if dff === null then error("addToMFCEntry: no differential at degree " | toString p#"d");
    dff_(p#"row", p#"col") = dff_(p#"row", p#"col") + p#"val";
);

isComplex = method(TypicalValue => Boolean);
isComplex(MutableFreeComplex) := Boolean => mfc -> (
    lo := getMFCMinDegree mfc; hi := getMFCMaxDegree mfc;
    for d from lo+2 to hi do (
        dHi := getMFCDifferential(mfc, d);
        dLo := getMFCDifferential(mfc, d-1);
        if dHi =!= null and dLo =!= null then
            if (matrix dLo) * (matrix dHi) != 0 then return false;
    );
    true
);

net MutableFreeComplex := mfc -> (
    lo := getMFCMinDegree mfc; hi := getMFCMaxDegree mfc;
    rankStrs := for d from lo to hi list toString(getMFCRank(mfc, d));
    net("MFC(" | toString lo | ".." | toString hi | ", ranks: " | demark(" <- ", rankStrs) | ")")
);

permuteMFCAtDegree = method();
permuteMFCAtDegree(MutableFreeComplex, ZZ, List) := (mfc, d, perm) -> (
    lo := getMFCMinDegree mfc; hi := getMFCMaxDegree mfc;
    n := #perm;
    R := getMFCRing mfc;

    if d >= lo+1 and d <= hi then (
        dffA := getMFCDifferential(mfc, d);
        if dffA =!= null then (
            nR := numRows dffA;
            oldCols := for c from 0 to n-1 list (
                for r from 0 to nR-1 list dffA_(r, c)
            );
            for newC from 0 to n-1 do (
                oldC := perm#newC;
                for r from 0 to nR-1 do
                    dffA_(r, newC) = sub(oldCols#oldC#r, R);
            );
        );
    );

    if d+1 >= lo+1 and d+1 <= hi then (
        dffB := getMFCDifferential(mfc, d+1);
        if dffB =!= null then (
            nC := numColumns dffB;
            oldRows := for r from 0 to n-1 list (
                for c from 0 to nC-1 list dffB_(r, c)
            );
            for newR from 0 to n-1 do (
                oldR := perm#newR;
                for c from 0 to nC-1 do
                    dffB_(newR, c) = sub(oldRows#oldR#c, R);
            );
        );
    );
);

vertexLabelSortKey = v -> (
    if isLabeled v then sort toList getVertexLabel v else {getVertexIndex v}
);

signOfValue = val -> (
    if instance(val, ZZ) or instance(val, QQ) then (
        if val > 0 then 1 else if val < 0 then -1 else 0
    ) else (
        lc := try lift(leadCoefficient val, ZZ) else leadCoefficient val;
        if instance(lc, ZZ) then (
            p := char ring val;
            if p > 0 and lc > p // 2 then -1
            else if lc > 0 then 1
            else if lc < 0 then -1
            else 0
        ) else (
            if lc > 0 then 1 else -1
        )
    )
);

edgesFromMFCWithVertices = (mfc, verts) -> (
    lo := getMFCMinDegree mfc; hi := getMFCMaxDegree mfc;
    vLookup := new MutableHashTable;
    for v in verts do vLookup#(getVertexKey v) = v;
    vHT := new HashTable from pairs vLookup;
    degEdges := d -> (
        dff := getMFCDifferential(mfc, d);
        if dff === null then return {};
        nR := numRows dff; nC := numColumns dff;
        flatten for c from 0 to nC-1 list (
            if not vHT#?{d, c} then continue;
            sv := vHT#{d, c};
            for r from 0 to nR-1 list (
                w := dff_(r,c);
                if w != 0 and vHT#?{d-1, r} then makeCGEdge(sv, vHT#{d-1, r}, w) else continue
            )
        )
    );
    tasks := for d from lo+1 to hi list schedule(degEdges, d);
    flatten for t in tasks list taskResult t
);

graphFromMFC = method(TypicalValue => CGGraph);
graphFromMFC(MutableFreeComplex) := CGGraph => mfc -> (
    lo := getMFCMinDegree mfc; hi := getMFCMaxDegree mfc;
    verts := flatten for d from lo to hi list (
        for i from 0 to getMFCRank(mfc, d) - 1 list makeCGVertex(d, i)
    );
    makeCGGraph(verts, edgesFromMFCWithVertices(mfc, verts))
);

ComplexGraph = new Type of MutableHashTable;

buildVertexPositionLookup = verts -> (
    byDeg := partition(v -> getVertexDegree v, verts);
    lookup := new MutableHashTable;
    for d in keys byDeg do (
        sorted := sortByKey(byDeg#d, v -> vertexLabelSortKey v);
        for i from 0 to #sorted - 1 do lookup#(getVertexKey sorted#i) = i;
    );
    lookup
);

buildComplexGraph = (graph, mfc, ring) -> (
    cg := new ComplexGraph;
    cg.graph = graph; cg.mfc = mfc; cg.ring = ring;
    cg.vertPos = buildVertexPositionLookup(getGraphVertices graph);
    cg
);

makeComplexGraph = method(TypicalValue => ComplexGraph);
makeComplexGraph(CGGraph, MutableFreeComplex) := ComplexGraph => (g, mfc) -> buildComplexGraph(g, mfc, getMFCRing mfc);

complexGraphFromMFC = method(TypicalValue => ComplexGraph);
complexGraphFromMFC(MutableFreeComplex) := ComplexGraph => mfc -> buildComplexGraph(graphFromMFC mfc, mfc, getMFCRing mfc);

getCGGraph = method(TypicalValue => CGGraph);
getCGGraph(ComplexGraph) := CGGraph => cg -> cg.graph;

getCGMFC = method(TypicalValue => MutableFreeComplex);
getCGMFC(ComplexGraph) := MutableFreeComplex => cg -> cg.mfc;

getCGRing = method(TypicalValue => Ring);
getCGRing(ComplexGraph) := Ring => cg -> cg.ring;

getCGEdgeWeight = method();
getCGEdgeWeight(ComplexGraph, CGEdge) := (cg, e) -> (
    mfc := cg.mfc; pos := cg.vertPos;
    d := getEdgeSourceDegree e;
    col := pos#(getVertexKey getEdgeSource e);
    row := pos#(getVertexKey getEdgeTarget e);
    dff := getMFCDifferential(mfc, d);
    if dff === null then error("getCGEdgeWeight: no diff at degree " | toString d);
    dff_(row, col)
);

getGraphVertices(ComplexGraph)             := List      => cg -> getGraphVertices getCGGraph cg;
getGraphEdges(ComplexGraph)                := List      => cg -> getGraphEdges getCGGraph cg;
getGraphVertexCount(ComplexGraph)          := ZZ        => cg -> getGraphVertexCount getCGGraph cg;
getGraphEdgeCount(ComplexGraph)            := ZZ        => cg -> getGraphEdgeCount getCGGraph cg;
getGraphVerticesByDegree(ComplexGraph)     := HashTable => cg -> getGraphVerticesByDegree getCGGraph cg;
getGraphVerticesAtDegree(ComplexGraph, ZZ) := List      => (cg, d) -> getGraphVerticesAtDegree(getCGGraph cg, d);
getGraphMinDegree(ComplexGraph)            := ZZ        => cg -> getGraphMinDegree getCGGraph cg;
getGraphMaxDegree(ComplexGraph)            := ZZ        => cg -> getGraphMaxDegree getCGGraph cg;
getOutgoingEdges(ComplexGraph, CGVertex)   := List      => (cg, v) -> getOutgoingEdges(getCGGraph cg, v);
getIncomingEdges(ComplexGraph, CGVertex)   := List      => (cg, v) -> getIncomingEdges(getCGGraph cg, v);
getOutgoingVertices(ComplexGraph, CGVertex) := List     => (cg, v) -> getOutgoingVertices(getCGGraph cg, v);
getIncomingVertices(ComplexGraph, CGVertex) := List     => (cg, v) -> getIncomingVertices(getCGGraph cg, v);

setCGEdgeWeight = method();
setCGEdgeWeight(ComplexGraph, CGEdge, Thing) := (cg, e, val) -> (
    mfc := cg.mfc; pos := cg.vertPos;
    d := getEdgeSourceDegree e;
    col := pos#(getVertexKey getEdgeSource e);
    row := pos#(getVertexKey getEdgeTarget e);
    dff := getMFCDifferential(mfc, d);
    if dff === null then error("setCGEdgeWeight: no diff at degree " | toString d);
    dff_(row, col) = val;
);

mGrdComplexGraph = new Type of ComplexGraph;

vertexExponents = (w, R) -> (
    if w === null or w == 0 then null
    else if instance(w, RingElement) and isPolynomialRing ring w then first exponents w
    else toList(numgens R : 0)
);

buildMGrdComplexGraph = (graph, mfc, ring) -> (
    cg := new mGrdComplexGraph;
    cg.graph = graph; cg.mfc = mfc; cg.ring = ring;
    cg.vertPos = buildVertexPositionLookup(getGraphVertices graph);
    md := new MutableHashTable;
    for v in getGraphVertices graph do (
        e := vertexExponents(getVertexWeight v, ring);
        if e =!= null then md#(getVertexDegree v, getVertexIndex v) = e;
    );
    cg.multidegree = md;
    cg
);

makeMGrdComplexGraph = method(TypicalValue => mGrdComplexGraph);
makeMGrdComplexGraph(CGGraph, MutableFreeComplex) := mGrdComplexGraph =>
    (g, mfc) -> buildMGrdComplexGraph(g, mfc, getMFCRing mfc);

getVertexMultidegree = method();
getVertexMultidegree(mGrdComplexGraph, CGVertex) := (cg, v) -> (
    md := cg.multidegree;
    k := (getVertexDegree v, getVertexIndex v);
    if md#?k then md#k else null
);
getVertexMultidegree(mGrdComplexGraph, ZZ, ZZ) := (cg, d, i) -> (
    md := cg.multidegree;
    if md#?(d, i) then md#(d, i) else null
);

syncGraphFromMFC = method(TypicalValue => mGrdComplexGraph);
syncGraphFromMFC(ComplexGraph) := mGrdComplexGraph => cg -> (
    mfc := getCGMFC cg; R := getCGRing cg;
    oldG := getCGGraph cg; newG := graphFromMFC mfc;
    oldLookup := new MutableHashTable;
    for v in getGraphVertices oldG do oldLookup#(getVertexKey v) = v;
    decorated := for v in getGraphVertices newG list (
        k := getVertexKey v;
        if oldLookup#?k then (
            ov := oldLookup#k;
            makeCGVertex(getVertexDegree v, getVertexIndex v, getVertexWeight ov, getVertexLabel ov)
        ) else v
    );
    buildMGrdComplexGraph(makeCGGraph(decorated, getGraphEdges newG), mfc, R)
);

net ComplexGraph := cg -> (
    g := getCGGraph cg;
    w := if any(getGraphVertices g, v -> isWeighted v) then ", weighted" else "";
    l := if any(getGraphVertices g, v -> isLabeled v) then ", labeled" else "";
    net("ComplexGraph(" | toString(getGraphVertexCount g) | " nodes, "
        | toString(getGraphEdgeCount g) | " edges" | w | l | ")")
);

reorderVerticesAtDegree = method(TypicalValue => mGrdComplexGraph);
reorderVerticesAtDegree(ComplexGraph, ZZ, List) := mGrdComplexGraph => (cg, d, perm) -> (
    mfc := getCGMFC cg;
    R := getCGRing cg;
    vertPos := cg.vertPos;
    lo := getMFCMinDegree mfc; hi := getMFCMaxDegree mfc;

    permuteMFCAtDegree(mfc, d, perm);

    allNewVerts := flatten for deg from lo to hi list (
        vertsAtDeg := getGraphVerticesAtDegree(cg, deg);
        posMap := new MutableList from toList(0 .. getMFCRank(mfc, deg) - 1);
        for v in vertsAtDeg do posMap#(vertPos#(getVertexKey v)) = v;
        if deg == d then (
            for i from 0 to #perm - 1 list (
                ov := posMap#(perm#i);
                makeCGVertex(deg, i, getVertexWeight ov, getVertexLabel ov)
            )
        ) else (
            for i from 0 to getMFCRank(mfc, deg) - 1 list (
                ov := posMap#i;
                makeCGVertex(deg, i, getVertexWeight ov, getVertexLabel ov)
            )
        )
    );

    edges := edgesFromMFCWithVertices(mfc, allNewVerts);

    newGraph := makeCGGraph(allNewVerts, edges);
    newCG := new mGrdComplexGraph;
    newCG.graph = newGraph;
    newCG.mfc = mfc;
    newCG.ring = R;
    newVertPos := new MutableHashTable;
    for v in allNewVerts do newVertPos#(getVertexKey v) = getVertexIndex v;
    newCG.vertPos = newVertPos;
    md := new MutableHashTable;
    for v in allNewVerts do (
        e := vertexExponents(getVertexWeight v, R);
        if e =!= null then md#(getVertexDegree v, getVertexIndex v) = e;
    );
    newCG.multidegree = md;
    newCG
);

orderedTaylorMFC = method(TypicalValue => MutableFreeComplex);
orderedTaylorMFC(List, Ring) := MutableFreeComplex => (gens, R) -> (
    n := #gens; nVars := numgens R;
    expVecs := for g in gens list flatten exponents g;
    mfc := makeMutableFreeComplex(for k from 0 to n list (k, binomial(n, k)), R);
    nthreads := max(1, allowableThreads);
    for d from 1 to n do (
        nCols := binomial(n, d); nRows := binomial(n, d-1);
        rIdx := buildSubsetIndex(n, d-1);
        sz := max(1, ceiling(nCols / nthreads));
        tasks := for i from 0 to (nCols - 1) // sz list
            schedule(computeTaylorChunkR, (expVecs, d, n, nVars, i*sz, min(nCols, (i+1)*sz), rIdx, R));
        ents := flatten for t in tasks list taskResult t;
        mfc.diffs#d = mutableMatrix map(R^nRows, R^nCols, ents);
    );
    mfc
);

buildTaylorVertices = (gens, R) -> (
    n := #gens;
    expVecs := for g in gens list flatten exponents g;
    nthreads := max(1, allowableThreads);
    {makeCGVertex(0, 0, 1_R, set {})} | flatten for k from 1 to n list (
        nCols := binomial(n, k);
        sz := max(1, ceiling(nCols / nthreads));
        ranges := for i from 0 to (nCols - 1) // sz list (i*sz, min(nCols, (i+1)*sz));
        tasks := for rng in ranges list schedule(computeSubsetLCMsChunk, (expVecs, n, k, rng#0, rng#1));
        allLcms := flatten for ti from 0 to #ranges - 1 list taskResult tasks#ti;
        for c from 0 to nCols - 1 list makeCGVertex(k, c, R_(allLcms#c), set lexSubsetAtIndex(n, k, c))
    )
);

taylorComplexGraph = method(TypicalValue => mGrdComplexGraph);
-- tau(eps_S) = sum_{i in S} (-1)^pos(i,S) (m_S / m_{S\i}) eps_{S\i},  m_S = lcm(m_i : i in S)
taylorComplexGraph(List, Ring) := mGrdComplexGraph => (gens, R) -> (
    mfc   := orderedTaylorMFC(gens, R);
    verts := buildTaylorVertices(gens, R);
    edges := edgesFromMFCWithVertices(mfc, verts);
    buildMGrdComplexGraph(makeCGGraph(verts, edges), mfc, R)
);

computeVertexWeightsAndLabels = mfc -> (
    lo := getMFCMinDegree mfc; hi := getMFCMaxDegree mfc;
    wts := new MutableHashTable; labs := new MutableHashTable;
    labs#{0,0} = set {}; wts#{0,0} = 1;
    if hi >= 1 then (
        d1 := getMFCDifferential(mfc, 1);
        for i from 0 to getMFCRank(mfc, 1) - 1 do (
            labs#{1,i} = set {i}; wts#{1,i} = d1_(0,i);
        );
    );
    for d from 2 to hi do (
        dff := getMFCDifferential(mfc, d);
        nC := getMFCRank(mfc, d); nR := getMFCRank(mfc, d-1);
        for c from 0 to nC-1 do (
            nzRows := {}; nzWts := {};
            for r from 0 to nR-1 do (
                w := dff_(r,c);
                if w != 0 then (nzRows = append(nzRows, r); nzWts = append(nzWts, w););
            );
            labs#{d,c} = set nzRows;
            wts#{d,c} = if #nzRows > 0 then nzWts#0 * wts#{d-1, nzRows#0} else 0;
        );
    );
    (wts, labs)
);

assignVertexLabels = method(TypicalValue => mGrdComplexGraph);
assignVertexLabels(MutableFreeComplex) := mGrdComplexGraph => mfc -> (
    R := getMFCRing mfc; lo := getMFCMinDegree mfc; hi := getMFCMaxDegree mfc;
    if lo == 0 and getMFCRank(mfc, 0) != 1 then error "Expected exactly one degree-0 vertex";
    (wts, labs) := computeVertexWeightsAndLabels mfc;
    verts := flatten for d from lo to hi list (
        for i from 0 to getMFCRank(mfc, d) - 1 list (
            k := {d, i};
            makeCGVertex(d, i, if wts#?k then wts#k else null, if labs#?k then labs#k else null)
        )
    );
    edges := edgesFromMFCWithVertices(mfc, verts);
    buildMGrdComplexGraph(makeCGGraph(verts, edges), mfc, R)
);
