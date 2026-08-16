DiskComplex = new Type of MutableHashTable;

buildDiskComplex = (dbDir, R, gensList, st) -> (
    new DiskComplex from {
        symbol dbPath  => dbDir,
        symbol ring    => R,
        symbol gens    => gensList,
        symbol numGens => #gensList,
        symbol state   => st
    }
);

openDiskComplex = method(TypicalValue => DiskComplex);
openDiskComplex(String, Ring) := DiskComplex => (dbDir, R) -> (
    if not isDirectory dbDir then
        error("openDiskComplex: directory not found: " | dbDir);
    metaDb   := openDB dcMetaPath dbDir;
    meta     := dbReadMeta metaDb;
    gensList := dbReadGensAsRingElts(metaDb, R);
    if instance(metaDb, FlatFileDB) then ffdbClose metaDb else close metaDb;
    st    := if meta#?"state" then meta#"state" else "taylor";
    << "openDiskComplex: loaded " << #gensList << " generators, state = " << st << endl;
    buildDiskComplex(dbDir, R, gensList, st)
);

getDCRing = method(TypicalValue => Ring);
getDCRing(DiskComplex) := Ring => dc -> dc.ring;

getDCState = method(TypicalValue => String);
getDCState(DiskComplex) := String => dc -> dc.state;

getDCRanks = method(TypicalValue => List);
getDCRanks(DiskComplex) := List => dc -> (
    db := openDB dcMetaPath dc.dbPath;
    rl := dbReadRanks db;
    if instance(db, FlatFileDB) then ffdbClose db else close db;
    rl
);

getDCNumGens = method(TypicalValue => ZZ);
getDCNumGens(DiskComplex) := ZZ => dc -> dc.numGens;

getDCGens = method(TypicalValue => List);
getDCGens(DiskComplex) := List => dc -> dc.gens;

getDCDbPath = method(TypicalValue => String);
getDCDbPath(DiskComplex) := String => dc -> dc.dbPath;

getDCMatchPairs = method(TypicalValue => List);
getDCMatchPairs(DiskComplex) := List => dc -> (
    if dc#?(symbol matchPairs) then dc#(symbol matchPairs) else null
);

getDCCriticalSubsets = method(TypicalValue => HashTable);
getDCCriticalSubsets(DiskComplex) := HashTable => dc -> (
    n   := dc.numGens;
    tbl := new MutableHashTable;
    for k from 0 to n do (
        rFile := dcRedPath(dc.dbPath, k);
        if fileExists rFile then (
            rdb := openDB rFile;
            cs  := dbReadCriticalSubsets(rdb, k);
            if instance(rdb, FlatFileDB) then ffdbClose rdb else close rdb;
            if #cs > 0 then tbl#k = cs;
        );
    );
    new HashTable from pairs tbl
);

net DiskComplex := dc -> (
    st := dc.state;
    net("DiskComplex(r=" | toString(dc.numGens) | ", state=" | st
        | ", db=" | dc.dbPath | ")")
);

FlatFileDB = new Type of MutableHashTable;

openFlatFileDB = filePath -> (
    ffdb := new FlatFileDB;
    ffdb#"\x00path" = filePath;
    if fileExists filePath then (
        for line in lines get filePath do (
            tabPos := position(characters line, ch -> ch == "\t");
            if tabPos =!= null then
                ffdb#(substring(line, 0, tabPos)) = substring(line, tabPos + 1);
        );
    );
    ffdb
);

ffdbSave = ffdb -> (
    filePath := ffdb#"\x00path";
    tmpPath  := filePath | ".tmp";
    outFile  := openOut tmpPath;
    for k in keys ffdb do
        if k != "\x00path" then outFile << k << "\t" << ffdb#k << "\n";
    close outFile;
    run("mv -f " | tmpPath | " " | filePath);
);

ffdbClose = ffdb -> (
    ffdbSave ffdb;
    for k in keys ffdb do remove(ffdb, k);
);

isEasley = () -> isDirectory "/easley/scratch";

defaultTmpDir = () -> (
    envPath := getenv "M2_TMPDIR";
    if envPath =!= "" then (
        if not isDirectory envPath then makeDirectory envPath;
        return envPath;
    );
    if isEasley() then (
        scratchDir := "/easley/scratch/users/" | getenv "USER" | "/ResDBData";
        if 0 != run("mkdir -p " | scratchDir) then
            error("defaultTmpDir: could not create " | scratchDir);
        return scratchDir;
    );
    pkgDir := (getenv "HOME") | "/Packages/ResDBData";
    if 0 != run("mkdir -p " | pkgDir) then
        error("defaultTmpDir: could not create " | pkgDir);
    pkgDir
);

uniqueDbDir = baseDir -> (
    dir := baseDir | "/cg_" | toString(currentTime()) | "_" | toString(processID());
    if 0 != run("mkdir -p " | dir | "/taylor " | dir | "/red " | dir | "/adj") then
        error("uniqueDbDir: could not create directory tree under " | dir);
    dir
);

dcMetaPath   = dir -> dir | "/meta.db";
dcMatchPath  = dir -> dir | "/match.db";
dcTaylorPath = (dir, deg) -> dir | "/taylor/d" | toString deg | ".db";
dcRedPath    = (dir, deg) -> dir | "/red/d"    | toString deg | ".db";
dcAdjPath    = (dir, deg) -> dir | "/adj/d"    | toString deg | ".db";

openDB = filePath -> (
    if isEasley() then (
        try openDatabase filePath else openFlatFileDB filePath
    ) else openFlatFileDB filePath
);

makeDiskComplex = method(TypicalValue => DiskComplex);
makeDiskComplex(List, Ring) := DiskComplex => (gensList, R) -> (
    makeDiskComplex(gensList, R, defaultTmpDir())
);
makeDiskComplex(List, Ring, String) := DiskComplex => (gensList, R, baseDir) -> (
    n     := #gensList;
    nVars := numgens R;
    if not isDirectory baseDir then makeDirectory baseDir;
    dbDir := uniqueDbDir baseDir;

    rankList := for k from 0 to n list (k, binomial(n, k));

    metaDb := openDB dcMetaPath dbDir;
    dbWriteMeta(metaDb, new HashTable from {
        "ring"    => toString R,
        "state"   => "taylor",
        "numGens" => n,
        "created" => toString currentTime()
    });
    dbWriteGens(metaDb, gensList);
    dbWriteRanks(metaDb, rankList);
    if instance(metaDb, FlatFileDB) then ffdbClose metaDb else close metaDb;

    expVecs := for g in gensList list flatten exponents g;

    numProcs   := max(1, allowableThreads);
    minChunkSz := 200;
    partitionCols := nCols -> (
        nChunks := max(1, min(numProcs, nCols // minChunkSz));
        chunkSz := (nCols + nChunks - 1) // nChunks;
        for i from 0 to nChunks - 1 list (
            s := i * chunkSz;
            (s, min(s + chunkSz, nCols))
        )
    );

    rangesByDeg := for deg from 1 to n list partitionCols binomial(n, deg);
    rowsByDeg   := for deg from 1 to n list buildSubsetIndex(n, deg-1);

    diffTasksByDeg := for i from 0 to n-1 list (
        deg  := i + 1;
        rIdx := rowsByDeg#i;
        for rng in rangesByDeg#i list
            schedule(computeTaylorDegreeChunkZZ, (expVecs, deg, n, nVars, rng#0, rng#1, rIdx))
    );
    wtTasksByDeg := for i from 0 to n-1 list (
        deg := i + 1;
        for rng in rangesByDeg#i list
            schedule(computeSubsetLCMsChunk, (expVecs, n, deg, rng#0, rng#1))
    );

    for i from 0 to n-1 do (
        deg   := i + 1;
        nCols := binomial(n, deg);
        nRows := binomial(n, deg-1);
        ranges := rangesByDeg#i;
        tdb   := openDB dcTaylorPath(dbDir, deg);
        dbWriteDim(tdb, "taylor", deg, nRows, nCols);
        tdb#("taylor:nvars:" | toString deg) = toString nVars;
        for ci from 0 to #ranges-1 do (
            rng    := ranges#ci;
            colSt  := rng#0;
            colEnd := rng#1;
            entries := taskResult diffTasksByDeg#i#ci;
            for e in entries do (
                key := "taylor:" | toString deg | ":" | toString(e#0) | ":" | toString(e#1);
                tdb#key = toString(e#2) | " " | expVecToString(e#3);
            );
            lcms := taskResult wtTasksByDeg#i#ci;
            for idx from colSt to colEnd-1 do
                dbWriteVertexWeight(tdb, "taylor", deg, idx, lcms#(idx - colSt));
        );
        if instance(tdb, FlatFileDB) then ffdbClose tdb else close tdb;
        << "  [makeDiskComplex] wrote degree " << deg << endl;
    );

    dc := buildDiskComplex(dbDir, R, gensList, "taylor");
    dc#(symbol ranks) = rankList;
    dc
);

computeTaylorDegreeChunkZZ = (expVecs, deg, n, nVars, colStart, colEnd, rowIndex) -> (
    entries := {};
    zeroVec := toList(nVars : 0);
    for col from colStart to colEnd-1 do (
        S       := lexSubsetAtIndex(n, deg, col);
        lcmSexp := expVecs#(S#0);
        for i from 1 to #S-1 do lcmSexp = expVecLcm(lcmSexp, expVecs#(S#i));
        for pos from 0 to deg-1 do (
            Sminus   := drop(S, {pos, pos});
            lcmSmExp := if #Sminus == 0 then zeroVec
                else (
                    tmp := expVecs#(Sminus#0);
                    for i from 1 to #Sminus-1 do tmp = expVecLcm(tmp, expVecs#(Sminus#i));
                    tmp
                );
            divExp := expVecDiv(lcmSexp, lcmSmExp);
            sgn    := (-1)^(deg + pos + 1);
            r      := rowIndex#Sminus;
            entries = append(entries, (r, col, sgn, divExp));
        );
    );
    entries
);

computeSubsetLCMsChunk = (expVecs, n, deg, colStart, colEnd) -> (
    zeroVec := toList(#expVecs#0 : 0);
    for col from colStart to colEnd-1 list (
        S := lexSubsetAtIndex(n, deg, col);
        if #S == 0 then zeroVec
        else (
            lcmE := expVecs#(S#0);
            for i from 1 to #S-1 do lcmE = expVecLcm(lcmE, expVecs#(S#i));
            lcmE
        )
    )
);

diskComplexToMFC = method(TypicalValue => MutableFreeComplex);
diskComplexToMFC(DiskComplex) := MutableFreeComplex => dc -> (
    R     := dc.ring;
    n     := dc.numGens;
    gensR := gens R;
    nVars := numgens R;
    rl    := for d from 0 to n list (d, binomial(n, d));
    mfc   := makeMutableFreeComplex(rl, R);
    for deg from 1 to n do (
        tdb := openDB dcTaylorPath(dc.dbPath, deg);
        raw := dbReadTaylorDegreeRaw(tdb, deg);
        if instance(tdb, FlatFileDB) then ffdbClose tdb else close tdb;
        if raw =!= null then (
            dff := getMFCDifferential(mfc, deg);
            if dff =!= null then
                for e in raw#3 do (
                    mono := product for k from 0 to nVars-1 list (gensR#k)^((e#3)#k);
                    val  := promote(e#2, R) * mono;
                    if val != 0 then dff_(e#0, e#1) = val;
                );
        );
    );
    mfc
);

diskComplexToComplexGraph = method(TypicalValue => ComplexGraph);
diskComplexToComplexGraph(DiskComplex) := ComplexGraph => dc -> (
    state := dc.state;
    if state == "taylor" or state == "matched" then return diskTaylorToComplexGraph dc;
    if state == "reduced" then return diskReducedToComplexGraph dc;
    error("diskComplexToComplexGraph: unsupported state " | state)
);

diskTaylorToComplexGraph = dc -> (
    R     := dc.ring; n := dc.numGens; gensList := dc.gens;
    gensR := gens R;    nVars := numgens R;
    metaDb := openDB dcMetaPath dc.dbPath;
    rl     := dbReadRanks metaDb;
    if instance(metaDb, FlatFileDB) then ffdbClose metaDb else close metaDb;
    verts := {makeCGVertex(0, 0, 1_R, set{})};
    for k from 1 to n do (
        tdb := openDB dcTaylorPath(dc.dbPath, k);
        idx := 0;
        for S in lexSubsets(n, k) do (
            ev := dbReadVertexWeight(tdb, "taylor", k, idx);
            wt := if ev =!= null then (
                product for j from 0 to nVars-1 list (gensR#j)^(ev#j)
            ) else
                lcm apply(S, i -> gensList#i);
            verts = append(verts, makeCGVertex(k, idx, wt, set S));
            idx = idx + 1;
        );
        if instance(tdb, FlatFileDB) then ffdbClose tdb else close tdb;
    );
    vLookup := new MutableHashTable;
    for v in verts do vLookup#(getVertexKey v) = v;
    mfc   := makeMutableFreeComplex(rl, R);
    edges := {};
    for deg from 1 to n do (
        tdb := openDB dcTaylorPath(dc.dbPath, deg);
        raw := dbReadTaylorDegreeRaw(tdb, deg);
        if instance(tdb, FlatFileDB) then ffdbClose tdb else close tdb;
        if raw =!= null then (
            dff := getMFCDifferential(mfc, deg);
            if dff =!= null then
                for e in raw#3 do (
                    mono := product for k from 0 to nVars-1 list (gensR#k)^((e#3)#k);
                    val  := promote(e#2, R) * mono;
                    if val != 0 then (
                        dff_(e#0, e#1) = val;
                        sk := {deg, e#1}; tk := {deg-1, e#0};
                        if vLookup#?sk and vLookup#?tk then
                            edges = append(edges, makeCGEdge(vLookup#sk, vLookup#tk, val));
                    );
                );
        );
    );
    buildComplexGraph(makeCGGraph(verts, edges), mfc, R)
);

diskReducedToComplexGraph = dc -> (
    R        := dc.ring;
    gensList := dc.gens;
    n        := dc.numGens;
    gensR    := gens R;
    nVars    := numgens R;
    metaDb := openDB dcMetaPath dc.dbPath;
    rl     := dbReadRanks metaDb;
    if instance(metaDb, FlatFileDB) then ffdbClose metaDb else close metaDb;
    verts    := {};
    critDegs := {};
    redRawByDeg := new MutableHashTable;
    for k from 0 to n do (
        rFile := dcRedPath(dc.dbPath, k);
        if fileExists rFile then (
            rdb := openDB rFile;
            cs  := dbReadCriticalSubsets(rdb, k);
            if #cs > 0 then (
                critDegs = append(critDegs, k);
                for i from 0 to #cs-1 do (
                    S  := cs#i;
                    ev := dbReadVertexWeight(rdb, "red", k, i);
                    wt := if ev =!= null then (
                        product for j from 0 to nVars-1 list (gensR#j)^(ev#j)
                    ) else (
                        if #S == 0 then 1_R else lcm apply(S, j -> gensList#j)
                    );
                    verts = append(verts, makeCGVertex(k, i, wt, set S));
                );
                dimInfo := dbReadReducedDim(rdb, k);
                if dimInfo =!= null then (
                    redPfx := "red:" | toString k | ":";
                    redKs  := select(keys rdb, key ->
                        #key > #redPfx and substring(key, 0, #redPfx) == redPfx);
                    redRawByDeg#k = (dimInfo, for key in redKs list (
                        rest := substring(key, #redPfx);
                        pts  := separate(":", rest);
                        if #pts != 2 then continue
                        else (value pts#0, value pts#1, rdb#key)
                    ));
                );
            );
            if instance(rdb, FlatFileDB) then ffdbClose rdb else close rdb;
        );
    );
    critDegs = sort critDegs;
    vLookup := new MutableHashTable;
    for v in verts do vLookup#(getVertexKey v) = v;
    mfc   := makeMutableFreeComplex(rl, R);
    edges := {};
    for deg in critDegs do (
        if not redRawByDeg#?deg then continue;
        raw := redRawByDeg#deg;
        dff := getMFCDifferential(mfc, deg);
        if dff === null then continue;
        for entry in raw#1 do (
            r := entry#0; c := entry#1;
            v := promote(value entry#2, R);
            if v != 0 then (
                dff_(r, c) = v;
                sk := {deg, c}; tk := {deg-1, r};
                if vLookup#?sk and vLookup#?tk then
                    edges = append(edges, makeCGEdge(vLookup#sk, vLookup#tk, v));
            );
        );
    );
    buildComplexGraph(makeCGGraph(verts, edges), mfc, R)
);

findCandidatesForJZZ = (expVecs, n, j) -> (
    candidates := {};
    evJ   := expVecs#j;
    nVars := #evJ;
    for k from 1 to n-1 do (
        for S in lexSubsets(n, k) do (
            if member(j, S) then continue;
            lcmExp := expVecs#(S#0);
            for i from 1 to #S-1 do (
                ei := expVecs#(S#i);
                lcmExp = for t from 0 to nVars-1 list max(lcmExp#t, ei#t);
            );
            if not all(nVars, t -> evJ#t <= lcmExp#t) then continue;
            pos  := 0;
            while pos < #S and S#pos < j do pos = pos + 1;
            srcS := take(S, pos) | {j} | drop(S, pos);
            candidates = append(candidates, {srcS, S});
        );
    );
    candidates
);

computeDiskMatching = method(TypicalValue => DiskComplex);
computeDiskMatching(DiskComplex) := DiskComplex => dc -> (
    gensList := dc.gens;
    n        := dc.numGens;
    R        := dc.ring;
    expVecs  := for g in gensList list flatten exponents g;
    tasks    := for j from 0 to n-1 list
                    schedule(findCandidatesForJZZ, (expVecs, n, j));
    candidatesByJ := for j from 0 to n-1 list taskResult tasks#j;
    matchedSubsets := new MutableHashTable;
    allPairs       := {};
    for j from 0 to n-1 do (
        roundMatched := new MutableHashTable;
        for pair in candidatesByJ#j do (
            srcS := pair#0; tgtS := pair#1;
            if matchedSubsets#?srcS then continue;
            if matchedSubsets#?tgtS then continue;
            if roundMatched#?srcS   then continue;
            if roundMatched#?tgtS   then continue;
            allPairs            = append(allPairs, pair);
            roundMatched#srcS   = true;
            roundMatched#tgtS   = true;
            matchedSubsets#srcS = true;
            matchedSubsets#tgtS = true;
        );
    );
    matchDb := openDB dcMatchPath dc.dbPath;
    dbWriteMatchingCount(matchDb, #allPairs);
    for i from 0 to #allPairs-1 do
        dbWriteMatchingPair(matchDb, i, allPairs#i#0, allPairs#i#1);
    for S in keys matchedSubsets do dbWriteMatchedSubset(matchDb, S);
    if instance(matchDb, FlatFileDB) then ffdbClose matchDb else close matchDb;
    metaDb := openDB dcMetaPath dc.dbPath;
    metaDb#("meta:state") = "matched";
    if instance(metaDb, FlatFileDB) then ffdbClose metaDb else close metaDb;
    dc#(symbol state)          = "matched";
    dc#(symbol matchPairs)     = allPairs;
    dc#(symbol matchedSubsets) = new HashTable from pairs matchedSubsets;
    dc
);

matchingDiskToEdgeList = method(TypicalValue => List);
matchingDiskToEdgeList(DiskComplex, ComplexGraph) := List => (dc, cg) -> (
    labelToVert := new MutableHashTable;
    for v in getGraphVertices cg do (
        if isLabeled v then (
            lbl := getVertexLabel v;
            if instance(lbl, Set) then
                labelToVert#(sort toList lbl) = v;
        );
    );
    prs := if dc#?(symbol matchPairs) then dc.matchPairs else (
        matchDb := openDB dcMatchPath dc.dbPath;
        p := dbReadMatchingPairs matchDb;
        if instance(matchDb, FlatFileDB) then ffdbClose matchDb else close matchDb;
        p
    );
    select(
        for pair in prs list (
            srcS := pair#0; tgtS := pair#1;
            if not (labelToVert#?srcS and labelToVert#?tgtS) then null
            else (
                srcV := labelToVert#srcS;
                tgtV := labelToVert#tgtS;
                makeCGEdge(srcV, tgtV,
                    getVertexWeight srcV // getVertexWeight tgtV)
            )
        ),
        e -> e =!= null
    )
);

flipAndIndexDegree = (rawEntries, deg, matchedSrcToTgt) -> (
    triples := {};
    for triple in rawEntries do (
        r  := triple#0; c := triple#1; sgn := triple#2;
        sk := {deg,   c};
        tk := {deg-1, r};
        if matchedSrcToTgt#?sk and matchedSrcToTgt#sk == tk then
            triples = append(triples, (tk, sk, -sgn))
        else
            triples = append(triples, (sk, tk, sgn));
    );
    triples
);

buildAdjListFromDB = (dc, matchedSrcToTgt) -> (
    n := dc.numGens;
    rawByDeg := for deg from 1 to n list (
        tdb    := openDB dcTaylorPath(dc.dbPath, deg);
        zzData := dbReadTaylorDegreeZZ(tdb, deg);
        if instance(tdb, FlatFileDB) then ffdbClose tdb else close tdb;
        if zzData === null then {} else zzData#2
    );
    tasks := for deg from 1 to n list
        schedule(flipAndIndexDegree, (rawByDeg#(deg-1), deg, matchedSrcToTgt));
    ht := new MutableHashTable;
    for deg from 1 to n do (
        triples := taskResult tasks#(deg-1);
        for t in triples do (
            sk := t#0; tk := t#1; wt := t#2;
            if not ht#?sk then ht#sk = {};
            ht#sk = append(ht#sk, (tk, wt));
        );
    );
    ht
);

buildAdjListForDegree = (dc, matchedSrcToTgt, deg) -> (
    tdb    := openDB dcTaylorPath(dc.dbPath, deg);
    zzData := dbReadTaylorDegreeZZ(tdb, deg);
    if instance(tdb, FlatFileDB) then ffdbClose tdb else close tdb;
    rawEntries := if zzData === null then {} else zzData#2;
    triples := flipAndIndexDegree(rawEntries, deg, matchedSrcToTgt);
    ht := new MutableHashTable;
    for t in triples do (
        sk := t#0; tk := t#1; wt := t#2;
        if not ht#?sk then ht#sk = {};
        ht#sk = append(ht#sk, (tk, wt));
    );
    new HashTable from pairs ht
);

computeGammaAllTargets = (adjList, srcKey, targetKeys) -> (
    visited  := new MutableHashTable;
    topoRev  := {};
    dfsStack := {(srcKey, false)};
    while #dfsStack > 0 do (
        (vKey, processed) := last dfsStack; dfsStack = drop(dfsStack, -1);
        if processed then (
            topoRev = append(topoRev, vKey);
        ) else if not visited#?vKey then (
            visited#vKey = true;
            dfsStack = append(dfsStack, (vKey, true));
            if adjList#?vKey then
                for pair in adjList#vKey do (
                    nKey := pair#0;
                    if not visited#?nKey then
                        dfsStack = append(dfsStack, (nKey, false));
                );
        );
    );
    pathWeight := new MutableHashTable;
    pathWeight#srcKey = 1;
    for vKey in reverse topoRev do (
        if not pathWeight#?vKey then continue;
        vWt := pathWeight#vKey;
        if adjList#?vKey then
            for pair in adjList#vKey do (
                nKey := pair#0; wt := pair#1;
                pathWeight#nKey = (if pathWeight#?nKey then pathWeight#nKey else 0) + vWt * wt;
            );
    );
    acc := new MutableHashTable;
    for tKey in keys targetKeys do (
        if pathWeight#?tKey then acc#tKey = pathWeight#tKey;
    );
    acc
);

computeColumnChunkKeys = (adjList, colKeys, posLookup, loKeySet) -> (
    for srcKey in colKeys list (
        colIndex := posLookup#srcKey;
        gammas   := computeGammaAllTargets(adjList, srcKey, loKeySet);
        colEntries := for vKey in keys gammas list (
            v := gammas#vKey;
            if v != 0 then (loKeySet#vKey, v) else continue
        );
        (colIndex, colEntries)
    )
);

traceGradientPathsDisk = method(TypicalValue => List);
traceGradientPathsDisk(HashTable, List, List, HashTable) := List =>
  (adjList, srcKey, tgtKey, keyToSubset) -> (
    result := {};
    stack  := {(srcKey, {srcKey}, 1)};
    while #stack > 0 do (
        top    := last stack; stack = drop(stack, -1);
        vKey   := top#0; trail := top#1; sgn := top#2;
        if adjList#?vKey then (
            for pair in adjList#vKey do (
                nKey     := pair#0; wt := pair#1;
                newSgn   := sgn * wt;
                newTrail := append(trail, nKey);
                if nKey == tgtKey then
                    result = append(result, (newTrail, newSgn))
                else if adjList#?nKey then
                    stack = append(stack, (nKey, newTrail, newSgn));
            );
        );
    );
    for r in result list (
        labels := for k in r#0 list (
            if keyToSubset#?k then set(keyToSubset#k) else k
        );
        append(labels, r#1)
    )
);

reduceDiskComplex = method(TypicalValue => DiskComplex);
reduceDiskComplex(DiskComplex) := DiskComplex => dc -> (
    R        := dc.ring;
    gensList := dc.gens;
    n        := dc.numGens;
    expVecs  := for g in gensList list flatten exponents g;
    nVars    := if #expVecs > 0 then #(expVecs#0) else numgens R;
    zeroVec  := toList(nVars : 0);

    subIdxCache := new MutableHashTable;
    subsetToKey := (S) -> (
        sz := #S;
        if not subIdxCache#?sz then subIdxCache#sz = buildSubsetIndex(n, sz);
        {sz, (subIdxCache#sz)#S}
    );
    matchedSrcToTgt := new MutableHashTable;
    prs := if dc#?(symbol matchPairs) then dc.matchPairs else (
        matchDb := openDB dcMatchPath dc.dbPath;
        p := dbReadMatchingPairs matchDb;
        if instance(matchDb, FlatFileDB) then ffdbClose matchDb else close matchDb;
        p
    );
    for pair in prs do (
        matchedSrcToTgt#(subsetToKey pair#0) = subsetToKey pair#1;
    );

    matched := if dc#?(symbol matchedSubsets) then dc.matchedSubsets else (
        ms := new MutableHashTable;
        for pair in prs do (ms#(pair#0) = true; ms#(pair#1) = true;);
        new HashTable from pairs ms
    );
    critSubsHT := new MutableHashTable;
    for k from 0 to n do (
        crits := select(lexSubsets(n, k), S -> not matched#?S);
        if #crits > 0 then critSubsHT#k = crits;
    );
    critDegs := sort keys critSubsHT;
    << "[reduceDiskComplex] Critical degrees: " << critDegs << endl;

    critKeysByDeg := new MutableHashTable;
    posLookup     := new MutableHashTable;
    for deg in critDegs do (
        si := if subIdxCache#?deg then subIdxCache#deg else buildSubsetIndex(n, deg);
        ks := for S in critSubsHT#deg list {deg, si#S};
        critKeysByDeg#deg = ks;
        for i from 0 to #ks-1 do posLookup#(ks#i) = i;
    );
    posLookupHT := new HashTable from pairs posLookup;

    degreesWithDiffs := select(critDegs, deg -> critSubsHT#?(deg-1));
    << "[reduceDiskComplex] Degrees with differentials: "
       << degreesWithDiffs << endl;

    rankList := for deg in critDegs list (deg, #(critSubsHT#deg));

    metaDb := openDB dcMetaPath dc.dbPath;
    dbWriteRanks(metaDb, rankList);
    metaDb#("meta:state") = "reduced";
    if instance(metaDb, FlatFileDB) then ffdbClose metaDb else close metaDb;

    numProcs   := max(1, allowableThreads);
    totalTasks := 0;
    for deg in critDegs do (
        rFile := dcRedPath(dc.dbPath, deg);
        if fileExists rFile then (
            probeDb := openDB rFile;
            cs  := dbReadCriticalSubsets(probeDb, deg);
            hasDiff     := critSubsHT#?(deg-1);
            alreadyDone := if #cs == 0 then false
                           else if hasDiff then dbReadReducedDim(probeDb, deg) =!= null
                           else true;
            if instance(probeDb, FlatFileDB) then ffdbClose probeDb else close probeDb;
            if alreadyDone then (
                << "[reduceDiskComplex] Degree " << deg << " already computed, skipping." << endl;
                continue;
            );
        );
        << "[reduceDiskComplex] Processing degree " << deg << "..." << endl;
        rdb := openDB dcRedPath(dc.dbPath, deg);
        dbWriteCriticalSubsets(rdb, deg, critSubsHT#deg);
        subsD := critSubsHT#deg;
        for i from 0 to #subsD-1 do (
            S  := subsD#i;
            ev := if #S == 0 then zeroVec
                  else (
                      lcmE := expVecs#(S#0);
                      for j from 1 to #S-1 do lcmE = expVecLcm(lcmE, expVecs#(S#j));
                      lcmE
                  );
            dbWriteVertexWeight(rdb, "red", deg, i, ev);
        );
        if critSubsHT#?(deg-1) then (
            adjListDeg := buildAdjListForDegree(dc, matchedSrcToTgt, deg);
            hiKeys   := critKeysByDeg#deg;
            loKeys   := critKeysByDeg#(deg-1);
            loKeySet := new HashTable from for lk in loKeys list lk => posLookupHT#lk;
            numCols  := #hiKeys;
            nCols    := #subsD;
            subsDm   := critSubsHT#(deg-1);
            nRows    := #subsDm;
            srcWts   := for S in subsD  list (if #S == 0 then 1_R else lcm apply(S, i -> gensList#i));
            tgtWts   := for S in subsDm list (if #S == 0 then 1_R else lcm apply(S, i -> gensList#i));
            maxT := if n <= 1 then 1
                    else min(numCols, min(ceiling(numProcs/3),
                            ceiling((1-deg)*(deg-n) + (n-2_QQ)*(deg-1)/(n-1) + 1)));
            chunkSz := max(1, ceiling(numCols / maxT));
            tasks := {};
            for i from 0 to (numCols - 1) // chunkSz do (
                startIdx := i * chunkSz;
                endIdx   := min(numCols-1, (i+1)*chunkSz - 1);
                colKeys  := hiKeys_{startIdx..endIdx};
                tasks = append(tasks,
                    schedule(computeColumnChunkKeys,
                        (adjListDeg, colKeys, posLookupHT, loKeySet)));
            );
            totalTasks = totalTasks + #tasks;
            dbWriteReducedDim(rdb, deg, nRows, nCols);
            for t in tasks do (
                for colData in taskResult t do (
                    cIdx  := colData#0;
                    srcWt := srcWts#cIdx;
                    for entry in colData#1 do (
                        rIdx     := entry#0;
                        intGamma := entry#1;
                        tgtWt    := tgtWts#rIdx;
                        val := if tgtWt != 0
                            then promote(intGamma, R) * srcWt // tgtWt
                            else promote(intGamma, R);
                        if val != 0 then dbWriteReducedEntry(rdb, deg, rIdx, cIdx, val);
                    );
                );
            );
        );
        if instance(rdb, FlatFileDB) then ffdbClose rdb else close rdb;
    );
    << "[reduceDiskComplex] Processed " << #critDegs
       << " degrees (" << totalTasks << " parallel Gamma tasks total)" << endl;
    dc#(symbol state) = "reduced";
    dc#(symbol ranks) = rankList;
    << "[reduceDiskComplex] Done" << endl;
    dc
);

persistAdjList = method();
persistAdjList(DiskComplex, MutableHashTable) := (dc, adjList) -> (
    byDeg := new MutableHashTable;
    for vKey in keys adjList do (
        deg := vKey#0;
        if not byDeg#?deg then byDeg#deg = {};
        byDeg#deg = append(byDeg#deg, (vKey, adjList#vKey));
    );
    for deg in keys byDeg do (
        adb := openDB dcAdjPath(dc.dbPath, deg);
        for entry in byDeg#deg do
            dbWriteAdjList(adb, entry#0, entry#1);
        if instance(adb, FlatFileDB) then ffdbClose adb else close adb;
    );
);

loadAdjList = method(TypicalValue => HashTable);
loadAdjList(DiskComplex) := HashTable => dc -> (
    n  := dc.numGens;
    ht := new MutableHashTable;
    for deg from 1 to n do (
        aFile := dcAdjPath(dc.dbPath, deg);
        if fileExists aFile then (
            adb   := openDB aFile;
            degHt := dbReadAllAdjLists adb;
            if instance(adb, FlatFileDB) then ffdbClose adb else close adb;
            for vKey in keys degHt do ht#vKey = degHt#vKey;
        );
    );
    new HashTable from pairs ht
);

buildKeyToSubsetFromDC = method(TypicalValue => HashTable);
buildKeyToSubsetFromDC(DiskComplex) := HashTable => dc -> (
    n     := dc.numGens;
    state := dc.state;
    ht    := new MutableHashTable;
    if state == "reduced" then (
        for d from 0 to n do (
            rFile := dcRedPath(dc.dbPath, d);
            if fileExists rFile then (
                rdb := openDB rFile;
                cs  := dbReadCriticalSubsets(rdb, d);
                if instance(rdb, FlatFileDB) then ffdbClose rdb else close rdb;
                for i from 0 to #cs-1 do ht#{d, i} = cs#i;
            );
        );
    ) else (
        if n > 20 then
            << "[buildKeyToSubsetFromDC] Warning: n=" << n
               << ", enumerating all Taylor subsets may be slow." << endl;
        ht#{0, 0} = {};
        for d from 1 to n do (
            idx := 0;
            for S in lexSubsets(n, d) do (ht#{d, idx} = S; idx = idx + 1;);
        );
    );
    new HashTable from pairs ht
);

getDCDifferentialMatrix = method();
getDCDifferentialMatrix(DiskComplex, ZZ) := (dc, d) -> (
    R  := dc.ring;
    mm := null;
    if dc.state == "reduced" then (
        rdb := openDB dcRedPath(dc.dbPath, d);
        mm = dbReadReducedDegreeRing(rdb, d, R);
        if instance(rdb, FlatFileDB) then ffdbClose rdb else close rdb;
    ) else (
        tdb := openDB dcTaylorPath(dc.dbPath, d);
        mm = dbReadTaylorDegreeRing(tdb, d, R);
        if instance(tdb, FlatFileDB) then ffdbClose tdb else close tdb;
    );
    mm
);

traceGradientPathsDiskFn = (adjList, srcKey, tgtKey, subsetFn) -> (
    result := {};
    stack  := {(srcKey, {srcKey}, 1)};
    while #stack > 0 do (
        top      := last stack; stack = drop(stack, -1);
        vKey     := top#0; trail := top#1; sgn := top#2;
        if adjList#?vKey then (
            for pair in adjList#vKey do (
                nKey     := pair#0; wt := pair#1;
                newTrail := append(trail, nKey);
                if nKey == tgtKey then
                    result = append(result, (newTrail, sgn * wt))
                else if adjList#?nKey then
                    stack = append(stack, (nKey, newTrail, sgn * wt));
            );
        );
    );
    for r in result list (
        labels := for k in r#0 list subsetFn k;
        append(labels, r#1)
    )
);

diskGradientPathLabels = method(TypicalValue => List);
diskGradientPathLabels(DiskComplex, List, List) := List => (dc, srcKey, tgtKey) -> (
    n   := dc.numGens;
    deg := srcKey#0;
    subIdxCache := new MutableHashTable;
    subsetToKey := (S) -> (
        sz := #S;
        if not subIdxCache#?sz then subIdxCache#sz = buildSubsetIndex(n, sz);
        {sz, (subIdxCache#sz)#S}
    );
    prs := if dc#?(symbol matchPairs) then dc.matchPairs else (
        matchDb := openDB dcMatchPath dc.dbPath;
        p       := dbReadMatchingPairs matchDb;
        if instance(matchDb, FlatFileDB) then ffdbClose matchDb else close matchDb;
        p
    );
    matchedSrcToTgt := new HashTable from
        for pair in prs list (subsetToKey pair#0) => (subsetToKey pair#1);
    adjList   := buildAdjListForDegree(dc, matchedSrcToTgt, deg);
    subsetFn  := key -> (
        d := key#0; idx := key#1;
        if d == 0 then {} else lexSubsetAtIndex(n, d, idx)
    );
    traceGradientPathsDiskFn(adjList, srcKey, tgtKey, subsetFn)
);

