

dbWriteMeta = (db, ht) -> (
    for k in keys ht do
        db#("meta:" | k) = toString(ht#k);
);

dbReadMeta = db -> (
    result := new MutableHashTable;
    ks := select(keys db, k -> substring(k, 0, 5) == "meta:");
    for k in ks do
        result#(substring(k, 5)) = db#k;
    new HashTable from pairs result
);

dbWriteSparseEntry = (db, prefix, d, r, c, val) -> (
    key := prefix | ":" | toString d | ":" | toString r | ":" | toString c;
    db#key = toString val;
);

dbWriteDim = (db, prefix, d, nRows, nCols) -> (
    db#(prefix | ":dim:" | toString d) = toString nRows | " " | toString nCols;
);

dbReadDim = (db, prefix, d) -> (
    key := prefix | ":dim:" | toString d;
    if db#?key then (
        parts := separate(" ", db#key);
        (value parts#0, value parts#1)
    ) else null
);

dbReadTaylorDegreeRaw = (db, d) -> (
    dimInfo := dbReadDim(db, "taylor", d);
    if dimInfo === null then return null;
    nRows := dimInfo#0; nCols := dimInfo#1;
    nVarsKey := "taylor:nvars:" | toString d;
    nVars := if db#?nVarsKey then value db#nVarsKey else 0;
    prefix := "taylor:" | toString d | ":";
    entries := {};
    ks := select(keys db, k -> #k > #prefix and substring(k, 0, #prefix) == prefix);
    for k in ks do (
        rest := substring(k, #prefix);
        parts := separate(":", rest);
        if #parts == 2 then (
            r := value parts#0;
            c := value parts#1;
            valStr := db#k;
            valParts := separate(" ", valStr);
            sgn := value valParts#0;
            ev := for i from 1 to #valParts - 1 list value(valParts#i);
            entries = append(entries, (r, c, sgn, ev));
        );
    );
    (nRows, nCols, nVars, entries)
);

dbReadTaylorDegreeZZ = (db, d) -> (
    raw := dbReadTaylorDegreeRaw(db, d);
    if raw === null then return null;
    (raw#0, raw#1, for e in raw#3 list (e#0, e#1, e#2))
);

dbReadTaylorDegreeRing = (db, d, R) -> (
    raw := dbReadTaylorDegreeRaw(db, d);
    if raw === null then return null;
    nRows := raw#0; nCols := raw#1; nVars := raw#2; entries := raw#3;
    M := mutableMatrix(R, nRows, nCols);
    gensR := gens R;
    for e in entries do (
        sgn := e#2; ev := e#3;
        mono := product for k from 0 to nVars-1 list (gensR#k)^(ev#k);
        val := promote(sgn, R) * mono;
        if val != 0 then M_(e#0, e#1) = val;
    );
    M
);

dbWriteMatchingPair = (db, idx, srcSubset, tgtSubset) -> (
    db#("match:pair:" | toString idx) = (
        demark(" ", for x in srcSubset list toString x) | "|" |
        demark(" ", for x in tgtSubset list toString x)
    );
);

dbReadMatchingPairs = db -> (
    countKey := "match:count";
    if not db#?countKey then return {};
    n := value db#countKey;
    for i from 0 to n-1 list (
        key := "match:pair:" | toString i;
        if db#?key then (
            halves := separate("|", db#key);
            src := for t in separate(" ", halves#0) list value t;
            tgt := for t in separate(" ", halves#1) list value t;
            {src, tgt}
        ) else continue
    )
);

dbWriteMatchingCount = (db, n) -> (
    db#"match:count" = toString n;
);

dbWriteMatchedSubset = (db, S) -> (
    db#("match:matched:" | demark(",", for x in S list toString x)) = "true";
);

dbWriteAdjList = (db, vertexKey, neighbors) -> (
    key := "adj:" | toString(vertexKey#0) | "," | toString(vertexKey#1);
    val := demark(";", for n in neighbors list (
        toString(n#0#0) | "," | toString(n#0#1) | "," | toString(n#1)
    ));
    db#key = val;
);

dbReadAllAdjLists = db -> (
    ht := new MutableHashTable;
    ks := select(keys db, k -> #k >= 4 and substring(k, 0, 4) == "adj:");
    for k in ks do (
        rest := substring(k, 4);
        parts := separate(",", rest);
        vKey := {value parts#0, value parts#1};
        val := db#k;
        if #val == 0 then (
            ht#vKey = {};
        ) else (
            ht#vKey = for entry in separate(";", val) list (
                ep := separate(",", entry);
                ({value ep#0, value ep#1}, value ep#2)
            );
        );
    );
    ht
);

dbWriteReducedEntry = (db, d, r, c, val) -> (
    dbWriteSparseEntry(db, "red", d, r, c, val);
);

dbWriteReducedDim = (db, d, nRows, nCols) -> (
    dbWriteDim(db, "red", d, nRows, nCols);
);

dbReadReducedDim = (db, d) -> (
    dbReadDim(db, "red", d)
);

dbReadReducedDegreeRing = (db, d, R) -> (
    dimInfo := dbReadReducedDim(db, d);
    if dimInfo === null then return null;
    nRows := dimInfo#0; nCols := dimInfo#1;
    M := mutableMatrix(R, nRows, nCols);
    prefix := "red:" | toString d | ":";
    ks := select(keys db, k -> #k > #prefix and substring(k, 0, #prefix) == prefix);
    for k in ks do (
        rest := substring(k, #prefix);
        parts := separate(":", rest);
        if #parts == 2 then (
            r := value parts#0;
            c := value parts#1;
            v := promote(value db#k, R);
            if v != 0 then M_(r, c) = v;
        );
    );
    M
);

dbWriteCriticalSubsets = (db, d, subsets) -> (
    db#("red:critsubs:" | toString d) = demark(";",
        for S in subsets list (
            if #S == 0 then "EMPTY"
            else demark(",", for x in S list toString x)
        ));
);

dbReadCriticalSubsets = (db, d) -> (
    key := "red:critsubs:" | toString d;
    if not db#?key then return {};
    val := db#key;
    if #val == 0 then return {};
    for entry in separate(";", val) list (
        if entry == "EMPTY" then {}
        else for t in separate(",", entry) list value t
    )
);

dbWriteRanks = (db, rankList) -> (
    db#("meta:ranks") = demark(";",
        for p in rankList list toString(p#0) | "," | toString(p#1));
);

dbReadRanks = db -> (
    key := "meta:ranks";
    if not db#?key then return {};
    for entry in separate(";", db#key) list (
        parts := separate(",", entry);
        (value parts#0, value parts#1)
    )
);

dbWriteGens = (db, gens) -> (
    db#("meta:numGens") = toString(#gens);
    for i from 0 to #gens-1 do
        db#("meta:gen:" | toString i) = demark(" ", for x in flatten exponents gens#i list toString x);
);

dbReadGensAsExpVecs = db -> (
    nKey := "meta:numGens";
    if not db#?nKey then return {};
    n := value db#nKey;
    for i from 0 to n-1 list (
        key := "meta:gen:" | toString i;
        if db#?key then
            for t in separate(" ", db#key) list value t
        else {}
    )
);

dbReadGensAsRingElts = (db, R) -> (
    expVecs := dbReadGensAsExpVecs db;
    gensR := gens R;
    nVars := numgens R;
    for ev in expVecs list (
        product for k from 0 to nVars-1 list (gensR#k)^(ev#k)
    )
);

dbWriteVertexWeight = (db, prefix, d, idx, expVec) -> (
    db#("vwt:" | prefix | ":" | toString d | ":" | toString idx) =
        expVecToString expVec;
);

dbReadVertexWeight = (db, prefix, d, idx) -> (
    key := "vwt:" | prefix | ":" | toString d | ":" | toString idx;
    if not db#?key then return null;
    stringToExpVec db#key
);
