

bridges = method(TypicalValue => List);
bridges Matrix := List => M -> (
    out := {};
    for r from 0 to numRows M - 1 do
        for c from 0 to numColumns M - 1 do (
            v := M_(r, c);
            if v != 0 and isUnit v then out = append(out, (r, c));
        );
    out
);
bridges MutableMatrix := List => M -> bridges matrix M;
bridges MutableFreeComplex := List => mfc -> (
    lo := getMFCMinDegree mfc; hi := getMFCMaxDegree mfc;
    out := {};
    for k from lo+1 to hi do (
        M := mfcMatrixAt(mfc, k);
        if M === null then continue;
        for rc in bridges M do out = append(out, (k, rc#0, rc#1));
    );
    out
);

rowOp = method();
rowOp(MutableMatrix, ZZ, ZZ, Thing) := (M, i, j, c) -> (
    if c == 0 then return;
    for k from 0 to numColumns M - 1 do
        M_(i, k) = M_(i, k) + c * M_(j, k);
);

colOp = method();
colOp(MutableMatrix, ZZ, ZZ, Thing) := (M, i, j, c) -> (
    if c == 0 then return;
    for k from 0 to numRows M - 1 do
        M_(k, i) = M_(k, i) + c * M_(k, j);
);

permuteRows = method(TypicalValue => Matrix);
permuteRows(Matrix, List) := Matrix => (M, perm) -> M^perm;
permuteCols = method(TypicalValue => Matrix);
permuteCols(Matrix, List) := Matrix => (M, perm) -> M_perm;

-- reversed matched edge has weight -1/pivot
replacementAdjacency = method(TypicalValue => HashTable);
replacementAdjacency(MutableFreeComplex, List) := HashTable => (mfc, matching) -> (
    R := getMFCRing mfc;
    hi := getMFCMaxDegree mfc;
    matchedSet := new MutableHashTable;
    for p in matching do matchedSet#((p#0, p#1, p#2)) = true;
    adj := new MutableHashTable;
    seenReversed := new MutableHashTable;
    for k from 1 to hi do (
        M := mfcMatrixAt(mfc, k);
        if M === null then continue;
        for r from 0 to numRows M - 1 do
            for c from 0 to numColumns M - 1 do (
                v := M_(r, c);
                if v == 0 then continue;
                src := (k, c); tgt := (k - 1, r);
                isMatched := matchedSet#?((k, r, c));
                if isMatched then (
                    if not adj#?tgt then adj#tgt = {};
                    adj#tgt = append(adj#tgt, (src, (-1_R) // v));
                    seenReversed#(k, r, c) = true;
                ) else (
                    if not adj#?src then adj#src = {};
                    adj#src = append(adj#src, (tgt, v));
                );
            );
    );
    for p in matching do (
        if seenReversed#?((p#0, p#1, p#2)) then continue;
        k := p#0; r := p#1; c := p#2;
        src := (k, c); tgt := (k - 1, r);
        if not adj#?tgt then adj#tgt = {};
        adj#tgt = append(adj#tgt, (src, 0_R));
    );
    new HashTable from pairs adj
);

hasDirectedCycle = adj -> (
    color := new MutableHashTable;
    verts := new MutableHashTable;
    for v in keys adj do (
        verts#v = true;
        for p in adj#v do verts#(p#0) = true;
    );
    found := false;
    for start in keys verts do (
        if found then break;
        if color#?start then continue;
        stack := {(start, 0)};
        color#start = 1;
        path := {start};
        while #stack > 0 and not found do (
            top := last stack;
            v := top#0; idx := top#1;
            outs := if adj#?v then adj#v else {};
            if idx >= #outs then (
                color#v = 2;
                stack = drop(stack, -1);
                path = drop(path, -1);
            ) else (
                stack = replace(#stack - 1, (v, idx + 1), stack);
                w := outs#idx#0;
                if not color#?w then (
                    color#w = 1;
                    stack = append(stack, (w, 0));
                    path = append(path, w);
                ) else if color#w == 1 then (
                    found = true;
                );
            );
        );
    );
    found
);

isAcyclicMatching = method(TypicalValue => Boolean);
isAcyclicMatching(MutableFreeComplex, List) := Boolean => (mfc, matching) -> (
    not hasDirectedCycle replacementAdjacency(mfc, matching)
);

greedyMorseMatching = method(TypicalValue => List);
greedyMorseMatching MutableFreeComplex := List => mfc -> (
    cand := bridges mfc;
    matching := {};
    used := new MutableHashTable;
    for p in cand do (
        d := p#0; r := p#1; c := p#2;
        if used#?(d, "r", r) or used#?(d, "c", c) then continue;
        if used#?(d - 1, "r", r) or used#?(d + 1, "c", c) then continue;
        trial := append(matching, (d, r, c));
        if isAcyclicMatching(mfc, trial) then (
            matching = trial;
            used#((d, "c", c)) = true;
            used#((d, "r", r)) = true;
        );
    );
    matching
);

bmMatrixMatching = method(TypicalValue => List);
bmMatrixMatching MutableFreeComplex := List => mfc -> (
    n := getMFCMaxDegree mfc;
    matching := {};
    matched := new MutableHashTable;
    for k in reverse(1 .. n) do (
        M := mfcMatrixAt(mfc, k);
        if M === null then continue;
        nR := numRows M;
        nC := numColumns M;
        if nR == 0 or nC == 0 then continue;
        for r in reverse(0 .. nR - 1) do (
            for c in reverse(0 .. nC - 1) do (
                if matched#?(k, c) or matched#?(k - 1, r) then continue;
                v := M_(r, c);
                if v == 0 or not isUnit v then continue;
                trial := append(matching, (k, r, c));
                if isAcyclicMatching(mfc, trial) then (
                    matching = trial;
                    matched#(k, c) = true;
                    matched#(k - 1, r) = true;
                );
            );
        );
    );
    matching
);

antidiagonalBinaryMatching = method(TypicalValue => List);
antidiagonalBinaryMatching MutableFreeComplex := List => mfc -> (
    n := getMFCMaxDegree mfc;
    if n == 0 then return {};

    visited := new MutableHashTable;
    order := {};
    level := 1;
    while #order < n do (
        denom := 2^level;
        for j from 1 to denom // 2 do (
            num := 2 * j - 1;
            d := ceiling((num * n) / denom);
            if d >= 1 and d <= n and not visited#?d then (
                order = append(order, d);
                visited#d = true;
            );
        );
        level = level + 1;
    );

    matching := {};
    matched := new MutableHashTable;
    for k in order do (
        M := mfcMatrixAt(mfc, k);
        if M === null then continue;
        nR := numRows M;
        nC := numColumns M;
        if nR == 0 or nC == 0 then continue;
        entries := flatten for r from 0 to nR - 1 list
                   for c from 0 to nC - 1 list (
                       dr := nR - 1 - r;
                       dc := nC - 1 - c;
                       {dr * dr + dc * dc, r, c}
                   );
        entries = sort entries;
        for e in entries do (
            r := e#1; c := e#2;
            if matched#?(k, c) or matched#?(k - 1, r) then continue;
            v := M_(r, c);
            if v == 0 or not isUnit v then continue;
            trial := append(matching, (k, r, c));
            if isAcyclicMatching(mfc, trial) then (
                matching = trial;
                matched#(k, c) = true;
                matched#(k - 1, r) = true;
            );
        );
    );
    matching
);

stronglyConnected = method(TypicalValue => List);
stronglyConnected HashTable := List => adj -> (
    idx := new MutableHashTable;
    low := new MutableHashTable;
    onStk := new MutableHashTable;
    stk := {};
    nextIdx := 0;
    comps := {};
    verts := new MutableHashTable;
    for v in keys adj do (
        verts#v = true;
        for p in adj#v do verts#(p#0) = true;
    );
    visit := null;
    visit = v -> (
        idx#v = nextIdx; low#v = nextIdx;
        nextIdx = nextIdx + 1;
        stk = append(stk, v); onStk#v = true;
        outs := if adj#?v then adj#v else {};
        for p in outs do (
            w := p#0;
            if not idx#?w then (
                visit w;
                if low#w < low#v then low#v = low#w;
            ) else if onStk#?w then (
                if idx#w < low#v then low#v = idx#w;
            );
        );
        if low#v == idx#v then (
            comp := {};
            done := false;
            while not done do (
                w := last stk;
                stk = drop(stk, -1);
                remove(onStk, w);
                comp = append(comp, w);
                if w === v then done = true;
            );
            comps = append(comps, comp);
        );
    );
    for v in keys verts do if not idx#?v then visit v;
    select(comps, c -> #c > 1)
);

sccs = method(TypicalValue => List);
sccs(MutableFreeComplex, List) := List => (mfc, perf) -> (
    adj := replacementAdjacency(mfc, perf);
    comps := stronglyConnected adj;
    out := {};
    for comp in comps do (
        degSet := unique apply(comp, v -> v#0);
        if #degSet != 2 then continue;
        upperDeg := max degSet;
        upper := select(comp, v -> v#0 == upperDeg);
        lowerCells := select(comp, v -> v#0 == upperDeg - 1);
        if #upper != #lowerCells then continue;
        ucols := sort apply(upper, v -> v#1);
        lrows := sort apply(lowerCells, v -> v#1);
        out = append(out, new HashTable from {
            "deg" => upperDeg,
            "upper" => ucols,
            "lower" => lrows,
            "edgeCount" => sum for v in comp list
                #(if adj#?v then adj#v else {})
        });
    );
    out
);

sccMatrix = method(TypicalValue => Matrix);
sccMatrix(MutableFreeComplex, HashTable) := Matrix => (mfc, cl) -> (
    d := cl#"deg";
    M := mfcMatrixAt(mfc, d);
    rows := cl#"lower";
    cols := cl#"upper";
    submatrix(M, rows, cols)
);

sccDet = method();
sccDet(MutableFreeComplex, HashTable) := (mfc, cl) -> (
    det sccMatrix(mfc, cl)
);

sccReport = method(TypicalValue => HashTable);
sccReport(MutableFreeComplex, List, HashTable) := HashTable => (mfc, perf, cl) -> (
    D := sccMatrix(mfc, cl);
    new HashTable from {
        "deg"        => cl#"deg",
        "upper"      => cl#"upper",
        "lower"      => cl#"lower",
        "matrix"     => D,
        "det"        => det D,
        "cycleRank"  => cycleRank(mfc, perf, cl)
    }
);

cycleRank = method(TypicalValue => ZZ);
cycleRank(MutableFreeComplex, List, HashTable) := ZZ => (mfc, perf, cl) -> (
    adj := replacementAdjacency(mfc, perf);
    inScc := new MutableHashTable;
    d := cl#"deg";
    for c in cl#"upper" do inScc#(d, c) = true;
    for r in cl#"lower" do inScc#(d - 1, r) = true;
    V := #(cl#"upper") + #(cl#"lower");
    E := 0;
    for v in keys inScc do (
        if not adj#?v then continue;
        for p in adj#v do
            if inScc#?(p#0) then E = E + 1;
    );
    E - V + 1
);

sccCycles = (adj, cl) -> (
    d := cl#"deg";
    nodes := join(for c in cl#"upper" list (d, c), for r in cl#"lower" list (d-1, r));
    idx := new MutableHashTable;
    for i from 0 to #nodes - 1 do idx#(nodes#i) = i;
    inCl := new MutableHashTable;
    for v in nodes do inCl#v = true;
    nbr := new MutableHashTable;
    for v in nodes do nbr#v = select(if adj#?v then adj#v else {}, p -> inCl#?(p#0));
    found := {};
    walk := null;
    walk = (start, cur, path, wt, onPath) -> (
        for e in nbr#cur do (
            nb := e#0; w := e#1;
            if nb === start then found = append(found, (path, wt * w))
            else if idx#nb > idx#start and not onPath#?nb then (
                onPath#nb = true;
                walk(start, nb, append(path, nb), wt * w, onPath);
                remove(onPath, nb);
            );
        );
    );
    for si from 0 to #nodes - 1 do (
        s := nodes#si;
        onPath := new MutableHashTable; onPath#s = true;
        walk(s, s, {s}, 1_QQ, onPath);
    );
    found
);

unmatchedCells = (mfc, matching) -> (
    used := new MutableHashTable;
    for p in matching do (
        used#(p#0, "r", p#1) = true;
        used#(p#0, "c", p#2) = true;
    );
    hi := getMFCMaxDegree mfc;
    out := new MutableHashTable;
    for k from 0 to hi do out#k = {};
    for k from 1 to hi do
        for c from 0 to getMFCRank(mfc, k) - 1 do
            if not used#?(k, "c", c) and not used#?(k + 1, "r", c) then
                out#k = append(out#k, c);
    for c from 0 to getMFCRank(mfc, 0) - 1 do
        if not used#?(1, "r", c) then out#0 = append(out#0, c);
    new HashTable from pairs out
);

-- every edge on a cycle preserves the multidegree, so only within-mcc unit
-- edges can lie in an SCC; restricting the adjacency to them makes the SCC test
-- mcc-local. Connectivity alone matters here, so edge weights are dropped.
fastSccAdjData = (mfc, sameMCC) -> (
    hi := getMFCMaxDegree mfc;
    fwdUnit := new MutableHashTable;
    for k from 1 to hi do (
        M := mfcMatrixAt(mfc, k);
        if M === null then (fwdUnit#k = {}; continue);
        E := entries M;
        L := {};
        for r from 0 to #E - 1 do (
            row := E#r;
            for c from 0 to #row - 1 do
                if row#c != 0 and isUnit row#c and sameMCC(k, c, r) then L = append(L, (r, c));
        );
        fwdUnit#k = L;
    );
    (hi, fwdUnit)
);

fastSccAdj = (hi, fwdUnit, matchingList) -> (
    matchedSet := new MutableHashTable;
    for p in matchingList do matchedSet#(p#0, p#1, p#2) = true;
    adj := new MutableHashTable;
    seen := new MutableHashTable;
    for k from 1 to hi do for t in fwdUnit#k do (
        (r, c) := t;
        src := (k, c); tgt := (k - 1, r);
        if matchedSet#?(k, r, c) then (
            adj#tgt = append(if adj#?tgt then adj#tgt else {}, (src, 1));
            seen#(k, r, c) = true;
        ) else
            adj#src = append(if adj#?src then adj#src else {}, (tgt, 1));
    );
    for key in keys matchedSet do if not seen#?key then (
        (k, r, c) := key;
        adj#(k-1, r) = append(if adj#?(k-1, r) then adj#(k-1, r) else {}, ((k, c), 1));
    );
    adj
);

makeFastSccs = (mfc, sameMCC) -> (
    (hi, fwdUnit) := fastSccAdjData(mfc, sameMCC);
    matchingList -> (
        adj := fastSccAdj(hi, fwdUnit, matchingList);
        out := {};
        for comp in stronglyConnected adj do (
            degSet := unique apply(comp, vv -> vv#0);
            if #degSet != 2 then continue;
            upperDeg := max degSet;
            upper := select(comp, vv -> vv#0 == upperDeg);
            lowerCells := select(comp, vv -> vv#0 == upperDeg - 1);
            if #upper != #lowerCells then continue;
            out = append(out, new HashTable from {
                "deg" => upperDeg,
                "upper" => sort apply(upper, vv -> vv#1),
                "lower" => sort apply(lowerCells, vv -> vv#1)
            });
        );
        out
    )
);

makeFastSccsChecked = (mfc, sameMCC) -> (
    (hi, fwdUnit) := fastSccAdjData(mfc, sameMCC);
    matchingList -> (
        adj := fastSccAdj(hi, fwdUnit, matchingList);
        out := {}; bad := false;
        for comp in stronglyConnected adj do (
            if #comp == 1 then continue;
            degSet := unique apply(comp, vv -> vv#0);
            if #degSet != 2 then (bad = true; continue);
            upperDeg := max degSet;
            upper := select(comp, vv -> vv#0 == upperDeg);
            lowerCells := select(comp, vv -> vv#0 == upperDeg - 1);
            if #upper != #lowerCells then (bad = true; continue);
            out = append(out, new HashTable from {
                "deg" => upperDeg,
                "upper" => sort apply(upper, vv -> vv#1),
                "lower" => sort apply(lowerCells, vv -> vv#1)
            });
        );
        (out, bad)
    )
);

homogeneousClosing = (mfc, matching, sameMCC) -> (
    fastSccs := makeFastSccsChecked(mfc, sameMCC);
    extended := matching;
    n := getMFCMaxDegree mfc;
    used := new MutableHashTable;
    for p in matching do (used#(p#0, "c", p#2) = true; used#(p#0 - 1, "r", p#1) = true;);
    progress := true;
    while progress do (
        progress = false;
        unm := unmatchedCells(mfc, extended);
        for k from 1 to n do (
            M := mfcMatrixAt(mfc, k);
            if M === null then continue;
            for c in (if unm#?k then unm#k else {}) do (
                if used#?(k, "c", c) then continue;
                for r in (if unm#?(k-1) then unm#(k-1) else {}) do (
                    if used#?(k, "c", c) then break;
                    if used#?(k-1, "r", r) then continue;
                    v := M_(r, c);
                    if v == 0 or not isUnit v then continue;
                    if not sameMCC(k, c, r) then continue;
                    trial := append(extended, (k, r, c));
                    (clsT, badSCC) := fastSccs trial;
                    bad := badSCC;
                    if not bad then for cl in clsT do
                        if det sccMatrix(mfc, cl) == 0 then (bad = true; break;);
                    if not bad then (
                        extended = trial; progress = true;
                        used#(k, "c", c) = true; used#(k-1, "r", r) = true;
                    );
                );
            );
        );
    );
    extended
);

ringSccOK = mfc -> (cl -> (dD := det sccMatrix(mfc, cl); dD != 0 and isConstant dD));

nondegenerateClosingCore = (mfc, matching, sameMCC, sccOK) -> (
    fastSccs := makeFastSccsChecked(mfc, sameMCC);
    extended := homogeneousClosing(mfc, matching, sameMCC);
    n := getMFCMaxDegree mfc;
    baseSccs := #((fastSccs extended)#0);
    used := new MutableHashTable;
    for p in extended do (used#(p#0, "c", p#2) = true; used#(p#0 - 1, "r", p#1) = true;);
    progress := true;
    while progress do (
        progress = false;
        unm := unmatchedCells(mfc, extended);
        for k from 1 to n do (
            M := mfcMatrixAt(mfc, k);
            if M === null then continue;
            for c in (if unm#?k then unm#k else {}) do (
                if used#?(k, "c", c) then continue;
                for r in (if unm#?(k-1) then unm#(k-1) else {}) do (
                    if used#?(k, "c", c) then break;
                    if used#?(k-1, "r", r) then continue;
                    if M_(r, c) != 0 then continue;
                    if not sameMCC(k, c, r) then continue;
                    trial := append(extended, (k, r, c));
                    (cls, badSCC) := fastSccs trial;
                    if badSCC then continue;
                    if #cls <= baseSccs then continue;
                    bad := false;
                    for cl in cls do (
                        if not sccOK cl then (bad = true; break;);
                    );
                    if not bad then (
                        extended = trial; baseSccs = #cls; progress = true;
                        used#(k, "c", c) = true; used#(k-1, "r", r) = true;
                    );
                );
            );
        );
    );
    extended
);

degenerateClosingCore = (mfc, matching, sameMCC) -> (
    fastSccs := makeFastSccs(mfc, sameMCC);
    extended := matching;
    n := getMFCMaxDegree mfc;
    usedOf := ext -> (
        u := new MutableHashTable;
        for p in ext do (u#(p#0, "c", p#2) = true; u#(p#0 - 1, "r", p#1) = true;);
        u
    );
    usedT := null; unmT := null;
    progress := true;
    while progress do (
        progress = false;
        usedT = usedOf extended;
        unmT = unmatchedCells(mfc, extended);
        for k from 1 to n do (
            M := mfcMatrixAt(mfc, k);
            if M === null then continue;
            for c in (if unmT#?k then unmT#k else {}) do
                for r in (if unmT#?(k-1) then unmT#(k-1) else {}) do (
                    if usedT#?(k, "c", c) or usedT#?(k-1, "r", r) then continue;
                    v := M_(r, c);
                    if v == 0 or not isUnit v then continue;
                    extended = append(extended, (k, r, c));
                    usedT#(k, "c", c) = true; usedT#(k-1, "r", r) = true;
                    progress = true;
                );
        );
    );
    baseSccs := #(fastSccs extended);
    progress = true;
    while progress do (
        progress = false;
        usedT = usedOf extended;
        unmT = unmatchedCells(mfc, extended);
        for k from 1 to n do (
            M := mfcMatrixAt(mfc, k);
            if M === null then continue;
            for c in (if unmT#?k then unmT#k else {}) do
                for r in (if unmT#?(k-1) then unmT#(k-1) else {}) do (
                    if usedT#?(k, "c", c) or usedT#?(k-1, "r", r) then continue;
                    if M_(r, c) != 0 then continue;
                    if not sameMCC(k, c, r) then continue;
                    trial := append(extended, (k, r, c));
                    if #(fastSccs trial) <= baseSccs then continue;
                    extended = trial;
                    baseSccs = baseSccs + 1;
                    usedT#(k, "c", c) = true; usedT#(k-1, "r", r) = true;
                    progress = true;
                );
        );
    );
    extended
);

cgSameMCC = cg -> (
    md := new MutableHashTable;
    for v in getGraphVertices cg do
        md#(getVertexDegree v, getVertexIndex v) = getVertexMultidegree(cg, v);
    (k, c, r) -> md#?(k, c) and md#?(k-1, r) and md#(k, c) === md#(k-1, r)
);

closing = method(TypicalValue => List);
closing(MutableFreeComplex, List) := List => (mfc, matching) ->
    drop(nondegenerateClosingCore(mfc, matching, (k, c, r) -> true, ringSccOK mfc), #matching);
closing(mGrdComplexGraph, List) := List => (cg, matching) ->
    drop(nondegenerateClosingCore(getCGMFC cg, matching, cgSameMCC cg, ringSccOK getCGMFC cg), #matching);

degenerateClosing = method(TypicalValue => List);
degenerateClosing(MutableFreeComplex, List) := List => (mfc, matching) ->
    drop(degenerateClosingCore(mfc, matching, (k, c, r) -> true), #matching);
degenerateClosing(mGrdComplexGraph, List) := List => (cg, matching) ->
    drop(degenerateClosingCore(getCGMFC cg, matching, cgSameMCC cg), #matching);

-- |det D_C|: 1 contractible in every characteristic, >1 torsion at the primes dividing it, 0 left critical
sccClass = method(TypicalValue => String);
sccClass(MutableFreeComplex, HashTable) := String => (mfc, cl) -> (
    d := sccDet(mfc, cl);
    if d == 0 then return "zero";
    if not isConstant d then return "nonconstant";
    v := sub(d, ZZ);
    if v < 0 then v = -v;
    if v == 0 then "zero" else if v == 1 then "unit" else "torsion"
);

sccCensus = method(TypicalValue => List);
sccCensus(MutableFreeComplex, List) := List => (mfc, clos) -> (
    cls := sccs(mfc, clos);
    for cl in cls list (
        d := sccDet(mfc, cl);
        cls0 := sccClass(mfc, cl);
        badP := if cls0 == "torsion" then (
            v := sub(d, ZZ); if v < 0 then v = -v;
            sort apply(toList factor v, fp -> fp#0)
        ) else {};
        new HashTable from {
            "deg"       => cl#"deg",
            "n"         => #(cl#"upper"),
            "det"       => d,
            "class"     => cls0,
            "badPrimes" => badP,
            "cycleRank" => cycleRank(mfc, clos, cl),
            "upper"     => cl#"upper",
            "lower"     => cl#"lower"
        }
    )
);

cellPartition = method(TypicalValue => HashTable);
cellPartition(MutableFreeComplex, List) := HashTable => (mfc, clos) -> (
    hi := getMFCMaxDegree mfc;
    cls := sccs(mfc, clos);
    classOfSccCell := new MutableHashTable;
    for cl in cls do (
        nm := "scc" | (
            c := sccClass(mfc, cl);
            if c == "unit" then "Unit" else if c == "torsion" then "Torsion"
            else if c == "zero" then "Zero" else "Nonconstant"
        );
        d := cl#"deg";
        for c in cl#"upper" do classOfSccCell#(d, c) = nm;
        for r in cl#"lower" do classOfSccCell#(d-1, r) = nm;
    );
    matchedCell := new MutableHashTable;
    for p in clos do (
        d := p#0; r := p#1; c := p#2;
        if classOfSccCell#?(d, c) or classOfSccCell#?(d-1, r) then continue;
        matchedCell#(d, c) = true; matchedCell#(d-1, r) = true;
    );
    buckets := new MutableHashTable;
    for nm in {"matched","sccUnit","sccTorsion","sccZero","sccNonconstant","critical"} do
        buckets#nm = {};
    for k from 0 to hi do
        for i from 0 to getMFCRank(mfc, k) - 1 do (
            nm := if classOfSccCell#?(k, i) then classOfSccCell#(k, i)
                  else if matchedCell#?(k, i) then "matched"
                  else "critical";
            buckets#nm = append(buckets#nm, (k, i));
        );
    surv := new MutableList from toList((hi+1):0);
    for cell in buckets#"critical" do surv#(cell#0) = surv#(cell#0) + 1;
    for cell in buckets#"sccZero" do surv#(cell#0) = surv#(cell#0) + 1;
    new HashTable from {
        "matched"          => buckets#"matched",
        "sccUnit"        => buckets#"sccUnit",
        "sccTorsion"     => buckets#"sccTorsion",
        "sccZero"        => buckets#"sccZero",
        "sccNonconstant" => buckets#"sccNonconstant",
        "critical"         => buckets#"critical",
        "survivorsByDeg"   => toList surv
    }
);

isMaximalMorse = method(TypicalValue => Boolean);
isMaximalMorse(MutableFreeComplex, List) := Boolean => (mfc, matching) -> (
    if not isAcyclicMatching(mfc, matching) then return false;
    used := new MutableHashTable;
    for p in matching do (
        used#(p#0, "r", p#1) = true;
        used#(p#0, "c", p#2) = true;
    );
    for b in bridges mfc do (
        d := b#0; r := b#1; c := b#2;
        if used#?(d, "r", r) or used#?(d, "c", c) then continue;
        trial := append(matching, b);
        if isAcyclicMatching(mfc, trial) then return false;
    );
    true
);

levelPairingCounts = method(TypicalValue => Sequence);
levelPairingCounts(MutableFreeComplex, List) := Sequence => (mfc, matching) -> (
    hi := getMFCMaxDegree mfc;
    nDeg := hi + 1;
    used := new MutableHashTable;
    for p in matching do (
        used#(p#0, "c", p#2) = true;
        used#(p#0 - 1, "r", p#1) = true;
    );
    v := for k from 0 to nDeg - 1 list (
        cnt := 0;
        for i from 0 to getMFCRank(mfc, k) - 1 do (
            isUp := used#?(k, "c", i);
            isDown := used#?(k, "r", i);
            if not isUp and not isDown then cnt = cnt + 1;
        );
        cnt
    );
    s := new MutableList from toList(nDeg : 0);
    sk := 0;
    for k from 0 to nDeg - 1 do (
        sk = v#k - sk;
        s#k = sk;
    );
    (v, toList s)
);

levelPairingExists = method(TypicalValue => Boolean);
levelPairingExists(MutableFreeComplex, List) := Boolean => (mfc, matching) -> (
    s := (levelPairingCounts(mfc, matching))#1;
    if #s == 0 then return true;
    if last s != 0 then return false;
    all(s, sk -> sk >= 0)
);

sccsAreSeparated = method(TypicalValue => Boolean);
sccsAreSeparated(MutableFreeComplex, List) := Boolean => (mfc, perf) -> (
    hi := getMFCMaxDegree mfc;
    cls := sccs(mfc, perf);
    cellScc := new MutableHashTable;
    for i from 0 to #cls - 1 do (
        d := (cls#i)#"deg";
        for c in (cls#i)#"upper" do cellScc#(d, c) = i;
        for r in (cls#i)#"lower" do cellScc#(d - 1, r) = i;
    );
    for k from 1 to hi do (
        M := mfcMatrixAt(mfc, k);
        if M === null then continue;
        for r from 0 to numRows M - 1 do
            for c from 0 to numColumns M - 1 do (
                if M_(r, c) == 0 then continue;
                src := (k, c); tgt := (k - 1, r);
                if not cellScc#?src or not cellScc#?tgt then continue;
                if cellScc#src != cellScc#tgt then return false;
            );
    );
    true
);

sccsAreLevelPairs = method(TypicalValue => Boolean);
sccsAreLevelPairs(MutableFreeComplex, List) := Boolean => (mfc, perf) -> (
    adj := replacementAdjacency(mfc, perf);
    comps := stronglyConnected adj;
    for comp in comps do (
        degs := unique apply(comp, v -> v#0);
        if #degs > 2 then return false;
        if #degs == 2 then (
            d0 := min degs; d1 := max degs;
            if d1 - d0 != 1 then return false;
            upper := select(comp, v -> v#0 == d1);
            lower := select(comp, v -> v#0 == d0);
            if #upper != #lower then return false;
        );
    );
    true
);

isNonDegenerateClosing = method(TypicalValue => Boolean);
isNonDegenerateClosing(MutableFreeComplex, List) := Boolean => (mfc, clos) -> (
    cls := sccs(mfc, clos);
    all(cls, cl -> sccDet(mfc, cl) != 0)
);

guaranteedSetting = method(TypicalValue => HashTable);
guaranteedSetting(MutableFreeComplex, List) := HashTable => (mfc, matching) -> (
    morse := isAcyclicMatching(mfc, matching);
    maximal := morse and isMaximalMorse(mfc, matching);
    (v, s) := levelPairingCounts(mfc, matching);
    levelOK := if #s == 0 then true else (last s == 0 and all(s, sk -> sk >= 0));
    perf := matching | closing(mfc, matching);
    unm := unmatchedCells(mfc, perf);
    covered := all(keys unm, k -> #(unm#k) == 0);
    nondeg := isNonDegenerateClosing(mfc, perf);
    h2 := sccsAreLevelPairs(mfc, perf);
    h3 := sccsAreSeparated(mfc, perf);
    new HashTable from {
        "morse"                => morse,
        "maximalMorse"         => maximal,
        "levelPairingExists"   => levelOK,
        "closingCovers"        => covered,
        "nonDegenerate"        => nondeg,
        "singleLevelPair"      => h2,
        "sccSeparated"     => h3,
        "closing"              => perf,
        "v"                    => v,
        "s"                    => s,
        "guaranteed"           => morse and maximal and levelOK and covered
                                  and nondeg and h2 and h3
    }
);

genMatchedSccs = method(TypicalValue => Sequence);
genMatchedSccs(MutableFreeComplex, List) := Sequence => (mfc, perf) -> (
    R := getMFCRing mfc;
    hi := getMFCMaxDegree mfc;
    cls := sccs(mfc, perf);
    sccCols := new MutableHashTable;
    sccRows := new MutableHashTable;
    for cl in cls do (
        d := cl#"deg";
        for c in cl#"upper" do sccCols#(d, c) = cl;
        for r in cl#"lower" do sccRows#(d - 1, r) = cl;
    );
    bMats := for k from 1 to hi list (
        M := mfcMatrixAt(mfc, k);
        if M === null then map(R^(getMFCRank(mfc, k-1)), R^(getMFCRank(mfc, k)), 0)
        else (
            nR := numRows M; nC := numColumns M;
            out := mutableMatrix(R, nR, nC);
            for p in perf do (
                if p#0 != k then continue;
                r := p#1; c := p#2;
                if sccCols#?(k, c) then continue;
                out_(r, c) = M_(r, c);
            );
            for cl in cls do (
                if cl#"deg" != k then continue;
                for c in cl#"upper" do
                    for r in cl#"lower" do
                        out_(r, c) = M_(r, c);
            );
            matrix out
        )
    );
    (bMats, cls)
);

sccHomotopy = method(TypicalValue => Matrix);
sccHomotopy(MutableFreeComplex, HashTable) := Matrix => (mfc, cl) -> (
    -(inverse sccMatrix(mfc, cl))
);

genHomotopy = method(TypicalValue => List);
genHomotopy(MutableFreeComplex, List) := List => (mfc, perf) -> (
    cls := sccs(mfc, perf);
    genHomotopy(mfc, perf, cls)
);
genHomotopy(MutableFreeComplex, List, List) := List => (mfc, perf, cls) -> (
    R := getMFCRing mfc;
    hi := getMFCMaxDegree mfc;
    hMats := for k from 1 to hi list
        mutableMatrix(R, getMFCRank(mfc, k), getMFCRank(mfc, k-1));
    sccAt := new MutableHashTable;
    for cl in cls do sccAt#(cl#"deg") = (
        if sccAt#?(cl#"deg") then append(sccAt#(cl#"deg"), cl)
        else {cl}
    );
    for p in perf do (
        k := p#0; r := p#1; c := p#2;
        inCl := false;
        for cl in (if sccAt#?k then sccAt#k else {}) do (
            if member(c, cl#"upper") and member(r, cl#"lower") then (
                inCl = true; break;
            );
        );
        if inCl then continue;
        M := mfcMatrixAt(mfc, k);
        u := M_(r, c);
        (hMats#(k - 1))_(c, r) = (-1_R) // u;
    );
    for cl in cls do (
        k := cl#"deg";
        Dinv := sccHomotopy(mfc, cl);
        rows := cl#"lower";
        cols := cl#"upper";
        for i from 0 to #cols - 1 do
            for j from 0 to #rows - 1 do
                (hMats#(k - 1))_(cols#i, rows#j) = Dinv_(i, j);
    );
    for h in hMats list matrix h
);

hplSeries = method(TypicalValue => Matrix);
hplSeries(Matrix, Matrix, ZZ) := Matrix => (delta, h, depth) -> (
    A := delta;
    term := delta;
    for k from 1 to depth do (
        term = delta * h * term;
        if term == 0 then break;
        A = A + term;
    );
    A
);

genAMTReduce = method(TypicalValue => HashTable);
genAMTReduce MutableFreeComplex := HashTable => mfc -> genAMTReduce(mfc, 0);
genAMTReduce(MutableFreeComplex, ZZ) := HashTable => (mfc, char) -> (
    R := getMFCRing mfc;
    hi := getMFCMaxDegree mfc;
    matching := greedyMorseMatching mfc;
    perf := matching | closing(mfc, matching);
    cls := sccs(mfc, perf);
    determinants := for cl in cls list sccDet(mfc, cl);

    if char > 0 then (
        for d in determinants do (
            v := sub(d, ZZ);
            if v % char == 0 then (
                error("characteristic " | toString char |
                      " divides a scc determinant " | toString d);
            );
        );
    );

    sccData := genMatchedSccs(mfc, perf);
    bMats := sccData#0;
    hMats := genHomotopy(mfc, perf, cls);

    inSccUpper := new MutableHashTable;
    inSccLower := new MutableHashTable;
    for cl in cls do (
        d := cl#"deg";
        for c in cl#"upper" do inSccUpper#(d, c) = true;
        for r in cl#"lower" do inSccLower#(d - 1, r) = true;
    );

    matchedUpper := new MutableHashTable;
    matchedLower := new MutableHashTable;
    for p in perf do (
        d := p#0; r := p#1; c := p#2;
        if inSccUpper#?(d, c) then continue;
        matchedUpper#(d, c) = true;
        matchedLower#(d - 1, r) = true;
    );

    critByDeg := new MutableHashTable;
    for k from 0 to hi do (
        crit := for i from 0 to getMFCRank(mfc, k) - 1 list (
            if matchedUpper#?(k, i) or matchedLower#?(k, i) then continue
            else if inSccUpper#?(k, i) or inSccLower#?(k, i) then continue
            else i
        );
        critByDeg#k = crit;
    );

    redDiffs := for k from 1 to hi list (
        M := mfcMatrixAt(mfc, k);
        nR := if M === null then getMFCRank(mfc, k-1) else numRows M;
        nC := if M === null then getMFCRank(mfc, k) else numColumns M;
        delta := if M === null then map(R^nR, R^nC, 0) else M - bMats#(k - 1);
        h := hMats#(k - 1);
        A := hplSeries(delta, h, 2 * (nR + nC) + 4);
        krows := critByDeg#(k - 1);
        kcols := critByDeg#k;
        if #krows == 0 or #kcols == 0 then map(R^(#krows), R^(#kcols), 0)
        else submatrix(A, krows, kcols)
    );

    new HashTable from {
        "matching"  => matching,
        "closing"   => perf,
        "sccs"  => cls,
        "determinants" => determinants,
        "diffs"     => redDiffs,
        "critByDeg" => new HashTable from pairs critByDeg,
        "ranks"     => for k from 0 to hi list #(critByDeg#k)
    }
);

minimalResolutionInChar = method(TypicalValue => HashTable);
minimalResolutionInChar(MutableFreeComplex, ZZ) := HashTable => (mfc, char) -> genAMTReduce(mfc, char);

cubePrunedMatchedMCCs = method(TypicalValue => List);
cubePrunedMatchedMCCs(List, Ring) := List => (genList, R) -> (
    cm := cubePrunedMatching(genList, R);
    critByMd := new MutableHashTable;
    for S in cm#"critical" do (
        b := (cm#"multidegree")#S;
        critByMd#b = (if critByMd#?b then critByMd#b else {}) | {S});
    for b in select(keys critByMd, b -> #(critByMd#b) > 1) list (
        (bySize, degs, shift, indexOf) := cubeMCCCells(genList, R, b);
        mfc := cubeMCCComplex(bySize, degs, shift, indexOf);
        matching := for p in cm#"matching" list (
            (S, T) := (p#0, p#1);
            if indexOf#?(#S) and (indexOf#(#S))#?S and indexOf#?(#T) and (indexOf#(#T))#?T
            then (#S - shift, (indexOf#(#T))#T, (indexOf#(#S))#S) else continue);
        new HashTable from {
            "multidegree" => b,
            "nCritical"   => #(critByMd#b),
            "mfc"         => mfc,
            "matching"    => matching,
            "shift"       => shift,
            "cellSubset"  => (mfcDeg, i) -> (bySize#(mfcDeg + shift))#i
        })
);

closingSCCs = method(TypicalValue => HashTable);
closingSCCs(MutableFreeComplex, List) := HashTable => (mfc, matching) -> (
    clos := matching | degenerateClosing(mfc, matching);
    cls := sccs(mfc, clos);
    adj := replacementAdjacency(mfc, clos);
    sccRecs := for cl in cls list (
        Dz := matrix applyTable(entries sccMatrix(mfc, cl), e -> lift(e, ZZ));
        rk := rank Dz;
        invF := for i from 0 to min(numRows Dz, numColumns Dz) - 1 list (
            e := (smithNormalForm Dz)#0_(i, i); if e < 0 then -e else e);
        badP := for p in cubePrunedResolutionPrimes list (
            if rank mutableMatrix(Dz ** (ZZ/p)) < rk then p else continue);
        new HashTable from {
            "deg"              => cl#"deg",
            "size"             => #(cl#"upper"),
            "rank"             => rk,
            "corank"           => #(cl#"upper") - rk,
            "class"            => sccClass(mfc, cl),
            "det"              => det Dz,
            "invariantFactors" => invF,
            "torsion"          => select(invF, e -> e != 0 and e != 1),
            "badPrimes"        => badP,
            "cokernel"         => prune coker Dz,
            "cycleRank"        => cycleRank(mfc, clos, cl),
            "cycles"           => for cyc in sccCycles(adj, cl) list new HashTable from {
                "cells" => cyc#0, "weight" => cyc#1 },
            "matrix"           => Dz,
            "upper"            => cl#"upper",
            "lower"            => cl#"lower"
        });
    byDeg := new MutableHashTable;
    for cl in cls do byDeg#(cl#"deg") = (if byDeg#?(cl#"deg") then byDeg#(cl#"deg") else {}) | {cl};
    dbInvF := {}; dbCorank := 0;
    for dd in sort keys byDeg do (
        grp := byDeg#dd; Mk := mfcMatrixAt(mfc, dd);
        ups := flatten for cl in grp list cl#"upper";
        los := flatten for cl in grp list cl#"lower";
        Db := matrix for r in los list for c in ups list lift(Mk_(r, c), ZZ);
        dbInvF = dbInvF | for i from 0 to min(numRows Db, numColumns Db) - 1 list (
            e := (smithNormalForm Db)#0_(i, i); if e < 0 then -e else e);
        dbCorank = dbCorank + (numRows Db - rank Db));
    new HashTable from {
        "closing"            => clos,
        "sccs"               => sccRecs,
        "DbInvariantFactors" => dbInvF,
        "DbCorank"           => dbCorank,
        "DbTorsion"          => select(dbInvF, e -> e > 1),
        "badPrimes"          => sort toList sum prepend(set {}, apply(sccRecs, r -> set r#"badPrimes"))
    }
);

cubePrunedClosingSCCs = method(TypicalValue => List);
cubePrunedClosingSCCs(List, Ring) := List => (genList, R) ->
    for mc in cubePrunedMatchedMCCs(genList, R) list (
        shift := mc#"shift"; cellSubset := mc#"cellSubset";
        clrec := closingSCCs(mc#"mfc", mc#"matching");
        decoded := for s in clrec#"sccs" list new HashTable from {
            "degPair"          => (s#"deg" - 1 + shift, s#"deg" + shift),
            "size"             => s#"size",
            "rank"             => s#"rank",
            "corank"           => s#"corank",
            "class"            => s#"class",
            "det"              => s#"det",
            "invariantFactors" => s#"invariantFactors",
            "torsion"          => s#"torsion",
            "badPrimes"        => s#"badPrimes",
            "cokernel"         => s#"cokernel",
            "cycleRank"        => s#"cycleRank",
            "cycles"           => for cyc in s#"cycles" list new HashTable from {
                "cells"  => for v in cyc#"cells" list (v#0 + shift, cellSubset(v#0, v#1)),
                "weight" => cyc#"weight" },
            "matrix"           => s#"matrix",
            "upperCells"       => for i in s#"upper" list cellSubset(s#"deg", i),
            "lowerCells"       => for r in s#"lower" list cellSubset(s#"deg" - 1, r) };
        new HashTable from {
            "multidegree"        => mc#"multidegree",
            "nCritical"          => mc#"nCritical",
            "sccs"               => decoded,
            "nUnit"              => #select(decoded, s -> s#"class" == "unit"),
            "nTorsion"           => #select(decoded, s -> s#"class" == "torsion"),
            "nZero"              => #select(decoded, s -> s#"class" == "zero"),
            "degenerateCorank"   => sum prepend(0, for s in decoded list (if s#"class" == "zero" then s#"corank" else 0)),
            "DbInvariantFactors" => clrec#"DbInvariantFactors",
            "DbCorank"           => clrec#"DbCorank",
            "DbTorsion"          => clrec#"DbTorsion",
            "badPrimes"          => clrec#"badPrimes"
        });

cubePrunedClosingComparison = method(TypicalValue => List);
cubePrunedClosingComparison(List, Ring) := List => (genList, R) -> (
    cm := cubePrunedMatching(genList, R);
    critByMd := new MutableHashTable;
    for S in cm#"critical" do (
        b := (cm#"multidegree")#S;
        critByMd#b = (if critByMd#?b then critByMd#b else {}) | {S};
    );
    out := {};
    for b in select(keys critByMd, b -> #(critByMd#b) > 1) do (
        (bySize, degs, shift, indexOf) := cubeMCCCells(genList, R, b);
        mfc := cubeMCCComplex(bySize, degs, shift, indexOf);
        cellSubset := (mfcDeg, i) -> (bySize#(mfcDeg + shift))#i;
        base := for p in cm#"matching" list (
            (S, T) := (p#0, p#1);
            if indexOf#?(#S) and (indexOf#(#S))#?S and indexOf#?(#T) and (indexOf#(#T))#?T
            then (#S - shift, (indexOf#(#T))#T, (indexOf#(#S))#S) else continue);

        maxC := base | degenerateClosing(mfc, base);
        degEdge := new MutableHashTable;
        for cl in sccs(mfc, base) do
            if det sccMatrix(mfc, cl) == 0 then
                for c in cl#"upper" do for r in cl#"lower" do degEdge#(cl#"deg", r, c) = true;
        ndBase := select(base, p -> not degEdge#?(p#0, p#1, p#2));
        ndC := ndBase | closing(mfc, ndBase);

        crank := (adjC, cl) -> (
            d := cl#"deg";
            cells := join(for c in cl#"upper" list (d, c), for r in cl#"lower" list (d-1, r));
            inC := new MutableHashTable; for v in cells do inC#v = true;
            E := sum for v in cells list #(select(if adjC#?v then adjC#v else {}, p -> inC#?(p#0)));
            E - #cells + 1
        );
        census := clos -> (
            adjC := replacementAdjacency(mfc, clos);
            for cl in sccs(mfc, clos) list (
                Dz := matrix applyTable(entries sccMatrix(mfc, cl), e -> lift(e, ZZ));
                rk := rank Dz;
                new HashTable from {
                    "degPair"    => (cl#"deg" - 1 + shift, cl#"deg" + shift),
                    "size"       => #(cl#"upper"),
                    "rank"       => rk,
                    "corank"     => #(cl#"upper") - rk,
                    "class"      => sccClass(mfc, cl),
                    "det"        => det Dz,
                    "cycleRank"  => crank(adjC, cl),
                    "cycles"     => for cyc in sccCycles(adjC, cl) list new HashTable from {
                        "cells"  => for v in cyc#0 list (v#0 + shift, cellSubset(v#0, v#1)),
                        "weight" => cyc#1 },
                    "matrix"     => Dz,
                    "upperCells" => for i in cl#"upper" list cellSubset(cl#"deg", i),
                    "lowerCells" => for r in cl#"lower" list cellSubset(cl#"deg" - 1, r)
                }
            )
        );

        maxPart := cellPartition(mfc, maxC);
        ndPart  := cellPartition(mfc, ndC);
        maxCritSet := new MutableHashTable;
        for cell in maxPart#"critical" do maxCritSet#cell = true;
        gapCells := for cell in ndPart#"critical" list (
            if maxCritSet#?cell then continue
            else (cell#0 + shift, cellSubset(cell#0, cell#1)));
        maxCensus := census maxC;

        out = append(out, new HashTable from {
            "multidegree" => b,
            "nCritical"   => #(critByMd#b),
            "maxClosing"  => new HashTable from {
                "nCritical" => #(maxPart#"critical"),
                "nMatched"  => #(maxPart#"matched"),
                "sccs"    => maxCensus },
            "ndClosing"   => new HashTable from {
                "nCritical" => #(ndPart#"critical"),
                "nMatched"  => #(ndPart#"matched"),
                "sccs"    => census ndC },
            "gapCells"    => gapCells,
            "gapSccs"   => select(maxCensus, blk -> blk#"class" == "zero")
        });
    );
    out
);

reduceByClosing = (mfc, matching, sameMCC) -> (
    Rng := getMFCRing mfc; hi := getMFCMaxDegree mfc;
    degEdge := new MutableHashTable;
    for cl in sccs(mfc, matching) do
        if det sccMatrix(mfc, cl) == 0 then
            for cc in cl#"upper" do for rr in cl#"lower" do degEdge#(cl#"deg", rr, cc) = true;
    ndBase := select(matching, p -> not degEdge#?(p#0, p#1, p#2));
    clos := nondegenerateClosingCore(mfc, ndBase, sameMCC, ringSccOK mfc);
    cls := sccs(mfc, clos);
    bMats := (genMatchedSccs(mfc, clos))#0;
    hMats := genHomotopy(mfc, clos, cls);
    inUp := new MutableHashTable; inLo := new MutableHashTable;
    for cl in cls do (d := cl#"deg"; for cc in cl#"upper" do inUp#(d,cc)=true; for rr in cl#"lower" do inLo#(d-1,rr)=true);
    mUp := new MutableHashTable; mLo := new MutableHashTable;
    for p in clos do (d:=p#0; rr:=p#1; cc:=p#2; if inUp#?(d,cc) then continue; mUp#(d,cc)=true; mLo#(d-1,rr)=true);
    critAt := new MutableHashTable;
    for k from 0 to hi do critAt#k = for i from 0 to getMFCRank(mfc,k)-1 list (
        if mUp#?(k,i) or mLo#?(k,i) or inUp#?(k,i) or inLo#?(k,i) then continue else i);
    for k from 1 to hi list (
        M := mfcMatrixAt(mfc, k); if M === null then continue;
        A := hplSeries(M - bMats#(k-1), hMats#(k-1), 2*(getMFCRank(mfc,k)+getMFCRank(mfc,k-1))+4);
        rows := critAt#(k-1); cols := critAt#k;
        if #rows==0 or #cols==0 then map(Rng^(#rows), Rng^(#cols), 0) else submatrix(A, rows, cols))
);

minimizeOverFieldCapped = (diffs, Rk, targets) -> (
    D := new MutableList from apply(diffs, MM -> sub(MM, Rk));
    n := #D;
    rankF := k -> if n == 0 then 0 else if k == 0 then numRows D#0 else numColumns D#(k-1);
    tgt := k -> if k >= 0 and k < #targets then targets#k else 0;
    findUnit := MM -> (
        for r from 0 to numRows MM - 1 do for c from 0 to numColumns MM - 1 do (
            e := MM_(r, c); if e != 0 and isUnit e then return (r, c));
        (null, null));
    changed := true;
    while changed do (
        changed = false;
        for k from 1 to n do (
            if rankF k <= tgt k or rankF(k-1) <= tgt(k-1) then continue;
            MM := D#(k-1);
            (fi, fj) := findUnit MM;
            if fi === null then continue;
            u := MM_(fi, fj);
            keepR := toList select(0 .. numRows MM - 1, r -> r != fi);
            keepC := toList select(0 .. numColumns MM - 1, c -> c != fj);
            D#(k-1) = if #keepR == 0 or #keepC == 0 then map(Rk^(#keepR), Rk^(#keepC), 0)
                else matrix for r in keepR list for c in keepC list (MM_(r, c) - (MM_(r, fj) * MM_(fi, c)) // u);
            if k < n then D#k = submatrix'(D#k, {fj}, {});
            if k >= 2 then D#(k-2) = submatrix'(D#(k-2), {}, {fi});
            changed = true;
        );
    );
    toList D
);

iteratedClosing = method(TypicalValue => List);
iteratedClosing(MutableFreeComplex, List) := List => (mfc, matching) ->
    minimizeOverField(reduceByClosing(mfc, matching, (k,c,r)->true), getMFCRing mfc);

cubePrunedResolutionMaps = method(TypicalValue => List);
cubePrunedResolutionMaps(List, Ring) := List => (genList, Rng) -> (
    n := #genList;
    betti := (cubePrunedResolution(genList, Rng))#"ranks";
    pd := #betti - 1;
    maxDeg := pd + 1;
    bySize := new MutableHashTable;
    for k from 0 to maxDeg do bySize#k = apply(subsets(n, k), sort);
    idxOf := new MutableHashTable;
    for k from 0 to maxDeg do (L := bySize#k; for i from 0 to #L - 1 do idxOf#(L#i) = i);
    lcmOf := S -> if #S == 0 then 1_Rng else lcm apply(S, j -> genList#j);
    mfc := makeMutableFreeComplex(for k from 0 to maxDeg list (k, #(bySize#k)), Rng);
    for k from 1 to maxDeg do (
        L := bySize#k;
        for c from 0 to #L - 1 do (
            S := L#c;
            for t from 0 to #S - 1 do (
                F := sort drop(S, {t, t});
                setMFCEntry(mfc, new HashTable from {
                    "d" => k, "row" => idxOf#F, "col" => c, "val" => (-1)^t * (lcmOf S // lcmOf F)});
            );
        );
    );
    cm := cubePrunedMatching(genList, Rng);
    base := for p in cm#"matching" list (
        if #(p#0) <= maxDeg then (#(p#0), idxOf#(sort p#1), idxOf#(sort p#0)) else continue);
    take(minimizeOverFieldCapped(reduceByClosing(mfc, base, (k,c,r)->true), Rng, betti | {0}), pd)
);

cubePrunedResolutionMapsFull = method(TypicalValue => List);
-- gradient-path monomials telescope to lcm(a)/lcm(a'), so the scalar is over QQ and the monomial is reattached
cubePrunedResolutionMapsFull(List, Ring) := List => (genList, Rng) -> (
    n := #genList;
    bySize := new MutableHashTable;
    for k from 0 to n do bySize#k = apply(subsets(n, k), sort);
    idxOf := new MutableHashTable;
    for k from 0 to n do (L := bySize#k; for i from 0 to #L - 1 do idxOf#(L#i) = i);
    lcmOf := S -> if #S == 0 then 1_Rng else lcm apply(S, j -> genList#j);
    cellLcm := new MutableHashTable;
    for k from 0 to n do for i from 0 to #(bySize#k) - 1 do cellLcm#(k, i) = lcmOf(bySize#k#i);
    mfc := makeMutableFreeComplex(for k from 0 to n list (k, #(bySize#k)), QQ);
    for k from 1 to n do (
        L := bySize#k;
        for c from 0 to #L - 1 do (
            S := L#c;
            for t from 0 to #S - 1 do (
                F := sort drop(S, {t, t});
                setMFCEntry(mfc, new HashTable from {"d"=>k, "row"=>idxOf#F, "col"=>c, "val"=>(-1)^t});
            );
        );
    );
    cm := cubePrunedMatching(genList, Rng);
    base := for p in cm#"matching" list (#(p#0), idxOf#(sort p#1), idxOf#(sort p#0));
    sameMCC := (k, c, r) -> cellLcm#(k, c) === cellLcm#(k-1, r);
    degEdge := new MutableHashTable;
    for cl in sccs(mfc, base) do if det sccMatrix(mfc, cl) == 0 then
        for cc in cl#"upper" do for rr in cl#"lower" do degEdge#(cl#"deg", rr, cc) = true;
    ndBase := select(base, p -> not degEdge#?(p#0, p#1, p#2));
    -- over QQ every det is constant, so require all cells of an SCC to share one multidegree
    oneMD := cl -> (
        if det sccMatrix(mfc, cl) == 0 then false
        else (
            dd := cl#"deg";
            ls := unique join(
                apply(cl#"upper", c -> lcmOf bySize#dd#c),
                apply(cl#"lower", r -> lcmOf bySize#(dd-1)#r));
            #ls == 1
        )
    );
    clos := nondegenerateClosingCore(mfc, ndBase, sameMCC, oneMD);
    cls := sccs(mfc, clos);
    bMats := (genMatchedSccs(mfc, clos))#0;
    hMats := genHomotopy(mfc, clos, cls);
    inUp := new MutableHashTable; inLo := new MutableHashTable;
    for cl in cls do (d := cl#"deg"; for cc in cl#"upper" do inUp#(d,cc)=true; for rr in cl#"lower" do inLo#(d-1,rr)=true);
    mUp := new MutableHashTable; mLo := new MutableHashTable;
    for p in clos do (d:=p#0; rr:=p#1; cc:=p#2; if inUp#?(d,cc) then continue; mUp#(d,cc)=true; mLo#(d-1,rr)=true);
    critAt := new MutableHashTable;
    for k from 0 to n do critAt#k = for i from 0 to getMFCRank(mfc,k)-1 list (
        if mUp#?(k,i) or mLo#?(k,i) or inUp#?(k,i) or inLo#?(k,i) then continue else i);
    monDiffs := for k from 1 to n list (
        M := mfcMatrixAt(mfc, k); if M === null then continue;
        A := hplSeries(M - bMats#(k-1), hMats#(k-1), 2*(getMFCRank(mfc,k)+getMFCRank(mfc,k-1))+4);
        rows := critAt#(k-1); cols := critAt#k;
        if #rows == 0 or #cols == 0 then map(Rng^(#rows), Rng^(#cols), 0)
        else (
            Asc := submatrix(A, rows, cols);
            Md := mutableMatrix(Rng, #rows, #cols);
            for ci from 0 to #cols - 1 do for ri from 0 to #rows - 1 do (
                s := Asc_(ri, ci);
                if s == 0 then continue;
                Md_(ri, ci) = sub(s, Rng) * (lcmOf(bySize#k#(cols#ci)) // lcmOf(bySize#(k-1)#(rows#ri)));
            );
            matrix Md
        )
    );
    minimizeOverField(monDiffs, Rng)
);

mccTestPrimes = {2, 3, 5, 7, 11, 13};

layerBettiOverField = (idxByDeg, intMats, F) -> (
    degs := sort keys idxByDeg;
    lo := min degs; up := max degs;
    rk := new MutableHashTable;
    for k from lo to up+1 do (
        if intMats#?k then (
            M := sub(intMats#k, F);
            rk#k = if char F > 0 then rank mutableMatrix M else rank M;
        ) else rk#k = 0;
    );
    nAt := k -> if idxByDeg#?k then #(idxByDeg#k) else 0;
    for k in degs list (
        b := nAt k - rk#k - (if rk#?(k+1) then rk#(k+1) else 0);
        (k, b)
    )
);

unitComponents = cg -> (
    g := getCGGraph cg;
    adj := new MutableHashTable;
    incident := new MutableHashTable;
    for e in getGraphEdges g do (
        if not isUnit getEdgeWeight e then continue;
        s := getEdgeSource e; t := getEdgeTarget e;
        sk := (getVertexDegree s, getVertexIndex s);
        tk := (getVertexDegree t, getVertexIndex t);
        adj#sk = (if adj#?sk then append(adj#sk, tk) else {tk});
        adj#tk = (if adj#?tk then append(adj#tk, sk) else {sk});
        incident#sk = true; incident#tk = true;
    );
    wt := new MutableHashTable;
    nN := 0;
    for v in getGraphVertices g do (
        ck := (getVertexDegree v, getVertexIndex v);
        wt#ck = getVertexWeight v;
        if not incident#?ck then nN = nN + 1;
    );
    seen := new MutableHashTable;
    comps := {};
    for start in keys incident do (
        if seen#?start then continue;
        comp := {}; queue := {start}; seen#start = true;
        while #queue > 0 do (
            v := first queue; queue = drop(queue, 1);
            comp = append(comp, v);
            for nb in (if adj#?v then adj#v else {}) do
                if not seen#?nb then (seen#nb = true; queue = append(queue, nb));
        );
        comps = append(comps, comp);
    );
    (comps, nN, wt)
);

mccs = method(TypicalValue => List, Options => {MaxCells => 800});
mccs mGrdComplexGraph := List => opts -> cg -> (
    mfc := getCGMFC cg;
    (comps, nN, wt) := unitComponents cg;
    out := {};
    for comp in comps do (
        idxByDeg := new MutableHashTable;
        for cell in comp do
            idxByDeg#(cell#0) = (if idxByDeg#?(cell#0) then append(idxByDeg#(cell#0), cell#1) else {cell#1});
        degs := sort keys idxByDeg;
        for k in degs do idxByDeg#k = sort idxByDeg#k;
        m := wt#(first comp);
        shape := for k in degs list (k, #(idxByDeg#k));
        nCells := #comp;
        bettiQ := null; badP := {};
        if nCells <= opts.MaxCells then (
            lo := min degs; up := max degs;
            intMats := new MutableHashTable;
            for k from lo+1 to up do (
                rows := if idxByDeg#?(k-1) then idxByDeg#(k-1) else {};
                cols := if idxByDeg#?k then idxByDeg#k else {};
                Mk := mfcMatrixAt(mfc, k);
                intMats#k = if #rows == 0 or #cols == 0 or Mk === null
                    then map(ZZ^(#rows), ZZ^(#cols), 0)
                    else matrix for r in rows list for c in cols list (
                        e := Mk_(r, c);
                        if e != 0 and liftable(e, QQ) and denominator lift(e,QQ) == 1
                        then lift(lift(e, QQ), ZZ) else 0);
            );
            bq := layerBettiOverField(idxByDeg, intMats, QQ);
            bettiQ = bq;
            bqHash := new HashTable from bq;
            for p in mccTestPrimes do (
                bp := layerBettiOverField(idxByDeg, intMats, ZZ/p);
                if any(bp, kv -> kv#1 > (if bqHash#?(kv#0) then bqHash#(kv#0) else 0)) then badP = append(badP, p);
            );
        );
        out = append(out, new HashTable from {
            "multidegree" => m, "shape" => shape, "nCells" => nCells,
            "bettiQ" => bettiQ, "badPrimes" => badP, "torsion" => #badP > 0,
            "cells" => sort comp
        });
    );
    ord := sort apply(#out, j -> (- (out#j)#"nCells", toString (out#j)#"multidegree", j));
    apply(ord, t -> out#(t#2))
);

mccSummary = method(TypicalValue => HashTable);
mccSummary mGrdComplexGraph := HashTable => cg -> (
    (comps, nN, wt) := unitComponents cg;
    byMd := new MutableHashTable;
    sizeHist := new MutableHashTable;
    for comp in comps do (
        m := wt#(first comp);
        key := toString m;
        if not byMd#?key then byMd#key = (m, {});
        byMd#key = ((byMd#key)#0, append((byMd#key)#1, #comp));
        sizeHist#(#comp) = (if sizeHist#?(#comp) then sizeHist#(#comp) + 1 else 1);
    );
    mdRecs := for key in keys byMd list (
        m := (byMd#key)#0; sizes := rsort (byMd#key)#1;
        new HashTable from {
            "multidegree" => m, "numMCCs" => #sizes,
            "sizes" => sizes, "totalCells" => sum sizes
        }
    );
    ord := sort apply(#mdRecs, j -> (- (mdRecs#j)#"totalCells", toString (mdRecs#j)#"multidegree", j));
    mdRecs = apply(ord, t -> mdRecs#(t#2));
    new HashTable from {
        "numMCCs"        => #comps,
        "numNonHomogeneous" => nN,
        "totalCells"        => (sum for c in comps list #c) + nN,
        "sizeHistogram"     => sort apply(keys sizeHist, sz -> (sz, sizeHist#sz)),
        "byMultidegree"     => mdRecs
    }
);

groupByMultidegree = genList -> (
    gexp := apply(genList, g -> first exponents g);
    nv := #(first gexp);
    mdOf := S -> (
        v := new MutableList from (nv : 0);
        for j in S do (e := gexp#j; for t from 0 to nv - 1 do if e#t > v#t then v#t = e#t);
        toList v);
    byMd := new MutableHashTable;
    for S in subsets(#genList) do (
        key := mdOf S;
        byMd#key = if byMd#?key then append(byMd#key, S) else {S});
    byMd
);

mccBoundary = cells -> (
    idxByDeg := new MutableHashTable;
    for S in cells do idxByDeg#(#S) = if idxByDeg#?(#S) then append(idxByDeg#(#S), S) else {S};
    degs := sort keys idxByDeg;
    for k in degs do idxByDeg#k = sort idxByDeg#k;
    pos := new MutableHashTable;
    for k in degs do (L := idxByDeg#k; for i from 0 to #L - 1 do pos#(L#i) = i);
    intMats := new MutableHashTable;
    for k in degs do (
        if not idxByDeg#?(k - 1) then continue;
        cols := idxByDeg#k;
        M := mutableMatrix(ZZ, #(idxByDeg#(k - 1)), #cols);
        for c from 0 to #cols - 1 do (
            S := cols#c;
            for t from 0 to #S - 1 do (
                F := drop(S, {t, t});
                if pos#?F and #F == k - 1 then M_(pos#F, c) = (-1)^t));
        intMats#k = matrix M);
    (idxByDeg, degs, intMats)
);

indexPairs = betti -> select(betti, pr -> pr#1 > 0);

mccData = method(TypicalValue => HashTable);
mccData(List, Ring) := HashTable => (genList, Rng) -> (
    byMd := groupByMultidegree genList;
    Fbig := ZZ / 32003;
    mccRec := (key, cells) -> (
        (idxByDeg, degs, intMats) := mccBoundary cells;
        bettiBig := layerBettiOverField(idxByDeg, intMats, Fbig);
        bad := for p in mccTestPrimes list (
            if layerBettiOverField(idxByDeg, intMats, ZZ / p) =!= bettiBig then p else continue);
        new HashTable from {
            "multidegree" => key,
            "nCells"      => #cells,
            "degrees"     => (min degs, max degs),
            "shape"       => for k in degs list (k, #(idxByDeg#k)),
            "betti"       => indexPairs bettiBig,
            "badPrimes"   => bad
        });
    mccRecs := apply(for key in keys byMd list schedule(mccRec, (key, byMd#key)), taskResult);
    totalBetti := new MutableHashTable;
    allBad := new MutableHashTable;
    for rec in mccRecs do (
        for pr in rec#"betti" do totalBetti#(pr#0) = pr#1 + (if totalBetti#?(pr#0) then totalBetti#(pr#0) else 0);
        for p in rec#"badPrimes" do allBad#p = true);
    hi := if #(keys totalBetti) == 0 then 0 else max keys totalBetti;
    new HashTable from {
        "betti"     => for i from 0 to hi list (if totalBetti#?i then totalBetti#i else 0),
        "badPrimes" => sort keys allBad,
        "nMCCs"     => #select(keys byMd, k -> #(byMd#k) > 1),
        "mccs"      => mccRecs
    }
);

polyString = L -> (
    terms := for i from 0 to #L - 1 list (
        c := L#i;
        if c == 0 then continue
        else if i == 0 then toString c
        else (if c == 1 then "" else toString c) | (if i == 1 then "t" else "t^" | toString i));
    if #terms == 0 then "0" else demark(" + ", terms)
);

polyOfPairs = pairs -> (
    if #pairs == 0 then return {0};
    hi := max apply(pairs, pr -> pr#0);
    for i from 0 to hi list sum append(for pr in pairs list (if pr#0 == i then pr#1 else 0), 0)
);

conleyMorseCompute = (genList, p) -> (
    byMd := groupByMultidegree genList;
    Fbig := ZZ / 32003;
    Fchar := if p == 0 then Fbig else ZZ / p;
    accInto := (acc, betti) -> for pr in betti do
        acc#(pr#0) = pr#1 + (if acc#?(pr#0) then acc#(pr#0) else 0);
    totQ := new MutableHashTable;
    totC := new MutableHashTable;
    mccRecs := {};
    for key in keys byMd do (
        cells := byMd#key;
        (idxByDeg, degs, intMats) := mccBoundary cells;
        bQ := layerBettiOverField(idxByDeg, intMats, Fbig);
        bC := if p == 0 then bQ else layerBettiOverField(idxByDeg, intMats, Fchar);
        accInto(totQ, bQ); accInto(totC, bC);
        if #cells > 1 then mccRecs = append(mccRecs, new HashTable from {
            "multidegree"  => key,
            "shape"        => for k in degs list (k, #(idxByDeg#k)),
            "conleyIndex"  => indexPairs bC,
            "conleyIndexQ" => indexPairs bQ,
            "torsion"      => bC =!= bQ
        }));
    hi := max(append(keys totQ, 0) | append(keys totC, 0));
    Plist := for i from 0 to hi list (if totC#?i then totC#i else 0);
    Blist := for i from 0 to hi list (if totQ#?i then totQ#i else 0);
    acc := 0; exact := true; nonneg := true;
    qlist := for i from 0 to hi list (qi := Plist#i - Blist#i - acc; acc = qi;
        if qi < 0 then nonneg = false; qi);
    if last qlist != 0 then exact = false else qlist = drop(qlist, -1);
    new HashTable from {
        "characteristic" => p,
        "P"        => Plist,
        "Pstring"  => polyString Plist,
        "betti"    => Blist,
        "Bstring"  => polyString Blist,
        "slack"    => qlist,
        "qString"  => polyString qlist,
        "verified" => exact and nonneg,
        "mccs"     => sort(mccRecs, r -> {- sum(r#"conleyIndex", pr -> pr#1), toString r#"multidegree"})
    }
);

conleyMorsePolynomial = method(TypicalValue => HashTable);
conleyMorsePolynomial(List, Ring) := HashTable => (genList, Rng) -> conleyMorseCompute(genList, 0);
conleyMorsePolynomial(List, Ring, ZZ) := HashTable => (genList, Rng, p) -> conleyMorseCompute(genList, p);

conleyIndex = method(TypicalValue => HashTable);
conleyIndex HashTable := HashTable => rec -> (
    if rec#?"mccs" then error("conleyIndex expects one mcc record, not the whole result");
    h := if rec#?"betti" then rec#"betti"
         else if rec#?"conleyIndex" then rec#"conleyIndex"
         else if rec#?"bettiQ" and rec#"bettiQ" =!= null then rec#"bettiQ"
         else error("conleyIndex found no homology field");
    pos := indexPairs h;
    new HashTable from {
        "multidegree" => if rec#?"multidegree" then rec#"multidegree" else null,
        "index"       => pos,
        "poincare"    => polyString polyOfPairs pos
    }
);
conleyIndex(List, Ring, ZZ) := List => (genList, Rng, p) ->
    apply((conleyMorseCompute(genList, p))#"mccs", conleyIndex);
conleyIndex(List, Ring) := List => (genList, Rng) -> conleyIndex(genList, Rng, 0);

verifyResolution = method(TypicalValue => HashTable);
-- alternating sum of ranks is 0 for a resolution of R/I of positive height
verifyResolution List := HashTable => diffs -> (
    ranks := if #diffs == 0 then {0}
        else prepend(numRows first diffs, for M in diffs list numColumns M);
    while #ranks > 1 and last ranks == 0 do ranks = drop(ranks, -1);
    d2 := all(for i from 0 to #diffs - 2 list (diffs#i * diffs#(i + 1) == 0), identity);
    altSum := sum for i from 0 to #ranks - 1 list (-1)^i * ranks#i;
    hasUnit := any(diffs, M -> any(flatten entries M, e -> e != 0 and isUnit e));
    new HashTable from {
        "ranks"          => ranks,
        "d2zero"         => d2,
        "alternatingSum" => altSum,
        "minimal"        => not hasUnit,
        "ok"             => d2 and altSum == 0 and not hasUnit
    }
);

mccReplAdj = (mfc, comp, smatch) -> (
    matched := new MutableHashTable;
    for p in smatch do matched#(p#0, p#1, p#2) = true;
    byDeg := new MutableHashTable;
    for cell in comp do
        byDeg#(cell#0) = (if byDeg#?(cell#0) then append(byDeg#(cell#0), cell#1) else {cell#1});
    adj := new MutableHashTable;
    for k in keys byDeg do (
        if not byDeg#?(k-1) then continue;
        M := mfcMatrixAt(mfc, k);
        if M === null then continue;
        for c in byDeg#k do
            for r in byDeg#(k-1) do (
                if M_(r, c) == 0 then continue;
                src := (k, c); tgt := (k-1, r);
                if matched#?(k, r, c) then
                    adj#tgt = (if adj#?tgt then append(adj#tgt, (src, 1)) else {(src, 1)})
                else
                    adj#src = (if adj#?src then append(adj#src, (tgt, 1)) else {(tgt, 1)});
            );
    );
    new HashTable from pairs adj
);

mccAcyclic = (mfc, comp, smatch) -> not hasDirectedCycle mccReplAdj(mfc, comp, smatch);

mccMatching = method(TypicalValue => List);
mccMatching mGrdComplexGraph := List => cg -> (
    mfc := getCGMFC cg;
    comps := (unitComponents cg)#0;
    matching := {};
    for comp in comps do (
        byDeg := new MutableHashTable;
        for cell in comp do
            byDeg#(cell#0) = (if byDeg#?(cell#0) then append(byDeg#(cell#0), cell#1) else {cell#1});
        cand := {};
        for k in rsort keys byDeg do (
            if not byDeg#?(k-1) then continue;
            M := mfcMatrixAt(mfc, k);
            if M === null then continue;
            for c in sort byDeg#k do
                for r in sort byDeg#(k-1) do (
                    v := M_(r, c);
                    if v != 0 and isUnit v then cand = append(cand, (k, r, c));
                );
        );
        smatch := {};
        used := new MutableHashTable;
        for e in cand do (
            k := e#0; r := e#1; c := e#2;
            if used#?(k, "c", c) or used#?(k-1, "r", r) then continue;
            trial := append(smatch, e);
            if mccAcyclic(mfc, comp, trial) then (
                smatch = trial;
                used#(k, "c", c) = true; used#(k-1, "r", r) = true;
            );
        );
        matching = matching | smatch;
    );
    if isAcyclicMatching(mfc, matching) then return matching;
    clean := {};
    usedG := new MutableHashTable;
    for e in matching do (
        k := e#0; r := e#1; c := e#2;
        if usedG#?(k, "c", c) or usedG#?(k-1, "r", r) then continue;
        trial := append(clean, e);
        if isAcyclicMatching(mfc, trial) then (
            clean = trial;
            usedG#(k, "c", c) = true; usedG#(k-1, "r", r) = true;
        );
    );
    clean
);

matchedIso = method();
matchedIso(MutableFreeComplex, List) := (mfc, clos) -> matchedIso(mfc, clos, 0);
matchedIso(MutableFreeComplex, List, ZZ) := (mfc, clos, char) -> (
    R := getMFCRing mfc; hi := getMFCMaxDegree mfc;
    cls := sccs(mfc, clos);
    sccOf := new MutableHashTable;
    absorbable := new MutableHashTable;
    for ci from 0 to #cls - 1 do (
        cl := cls#ci; d := sccDet(mfc, cl);
        absorbable#ci = (d != 0) and (char == 0 or (isConstant d and (sub(d, ZZ) % char != 0)));
        dd := cl#"deg";
        for c in cl#"upper" do sccOf#(dd, c) = ci;
        for r in cl#"lower" do sccOf#(dd - 1, r) = ci;
    );
    bAbs := for k from 1 to hi list (
        M := mfcMatrixAt(mfc, k);
        if M === null then map(R^(getMFCRank(mfc, k-1)), R^(getMFCRank(mfc, k)), 0)
        else (
            out := mutableMatrix(R, numRows M, numColumns M);
            for p in clos do (
                if p#0 != k then continue;
                if sccOf#?(k, p#2) then continue;
                out_(p#1, p#2) = M_(p#1, p#2);
            );
            for ci from 0 to #cls - 1 do (
                if not absorbable#ci then continue;
                cl := cls#ci; if cl#"deg" != k then continue;
                for c in cl#"upper" do for r in cl#"lower" do out_(r, c) = M_(r, c);
            );
            matrix out
        )
    );
    absCols := new MutableHashTable; absRows := new MutableHashTable;
    for k from 0 to hi do (absCols#k = {}; absRows#k = {});
    for p in clos do (
        if sccOf#?(p#0, p#2) then continue;
        absCols#(p#0) = append(absCols#(p#0), p#2);
        absRows#(p#0 - 1) = append(absRows#(p#0 - 1), p#1);
    );
    for ci from 0 to #cls - 1 do (
        if not absorbable#ci then continue;
        cl := cls#ci; d := cl#"deg";
        for c in cl#"upper" do absCols#d = append(absCols#d, c);
        for r in cl#"lower" do absRows#(d - 1) = append(absRows#(d - 1), r);
    );
    for k from 0 to hi do (absCols#k = sort unique absCols#k; absRows#k = sort unique absRows#k);
    recs := for k from 1 to hi list (
        cols := absCols#k; rows := absRows#(k - 1);
        mu := if #cols == 0 then map(R^0, R^0, 0) else submatrix(bAbs#(k-1), rows, cols);
        new HashTable from {
            "deg" => k, "cols" => cols, "rows" => rows, "mu" => mu,
            "det" => if #cols == 0 then 1_R else det mu
        }
    );
    new HashTable from {
        "bAbs" => bAbs, "isoByDeg" => recs, "sccOf" => sccOf,
        "absorbable" => new HashTable from pairs absorbable, "sccs" => cls,
        "absCols" => new HashTable from pairs absCols,
        "absRows" => new HashTable from pairs absRows
    }
);

-- cancel a unit pivot d_k(i,j) by the Schur complement d_k(r,c) -= d_k(r,j) d_k(i,c) / d_k(i,j)
minimizeOverField = (diffs, Rk) -> (
    D := new MutableList from apply(diffs, MM -> sub(MM, Rk));
    n := #D;
    findUnit := MM -> (
        for r from 0 to numRows MM - 1 do
            for c from 0 to numColumns MM - 1 do (
                e := MM_(r, c);
                if e != 0 and isUnit e then return (r, c);
            );
        (null, null)
    );
    changed := true;
    while changed do (
        changed = false;
        for k from 1 to n do (
            MM := D#(k-1);
            (fi, fj) := findUnit MM;
            if fi === null then continue;
            u := MM_(fi, fj);
            keepR := toList select(0 .. numRows MM - 1, r -> r != fi);
            keepC := toList select(0 .. numColumns MM - 1, c -> c != fj);
            D#(k-1) = if #keepR == 0 or #keepC == 0 then map(Rk^(#keepR), Rk^(#keepC), 0)
                else matrix for r in keepR list for c in keepC list
                    (MM_(r, c) - (MM_(r, fj) * MM_(fi, c)) // u);
            if k < n then D#k = submatrix'(D#k, {fj}, {});
            if k >= 2 then D#(k-2) = submatrix'(D#(k-2), {}, {fi});
            changed = true;
        );
    );
    toList D
);

genAMTReduce(mGrdComplexGraph) := HashTable => cg -> genAMTReduce(cg, 0);
genAMTReduce(mGrdComplexGraph, ZZ) := HashTable => (cg, char) -> (
    mfc := getCGMFC cg; R := getMFCRing mfc; hi := getMFCMaxDegree mfc;
    M := mccMatching cg;
    clos := M | closing(cg, M);
    iso := matchedIso(mfc, clos, char);
    bAbs := iso#"bAbs"; isoByDeg := iso#"isoByDeg"; cls := iso#"sccs";
    determinants := for cl in cls list sccDet(mfc, cl);
    matchedDets := for rec in isoByDeg list rec#"det";
    invertible := all(matchedDets, d -> d != 0);

    hMats := for k from 1 to hi list mutableMatrix(R, getMFCRank(mfc, k), getMFCRank(mfc, k-1));
    for rec in isoByDeg do (
        k := rec#"deg"; cols := rec#"cols"; rows := rec#"rows";
        if #cols == 0 then continue;
        muInv := inverse rec#"mu";
        for i from 0 to #cols - 1 do
            for j from 0 to #rows - 1 do
                (hMats#(k-1))_(cols#i, rows#j) = -(muInv_(i, j));
    );
    hMats = for h in hMats list matrix h;

    absUp := new MutableHashTable; absLo := new MutableHashTable;
    for k from 0 to hi do (
        for c in iso#"absCols"#k do absUp#(k, c) = true;
        for r in iso#"absRows"#k do absLo#(k, r) = true;
    );
    critByDeg := new MutableHashTable;
    for k from 0 to hi do critByDeg#k =
        for i from 0 to getMFCRank(mfc, k) - 1 list (
            if absUp#?(k, i) or absLo#?(k, i) then continue else i);

    redDiffs := for k from 1 to hi list (
        Mk := mfcMatrixAt(mfc, k);
        nR := if Mk === null then getMFCRank(mfc, k-1) else numRows Mk;
        nC := if Mk === null then getMFCRank(mfc, k) else numColumns Mk;
        delta := if Mk === null then map(R^nR, R^nC, 0) else Mk - bAbs#(k-1);
        A := hplSeries(delta, hMats#(k-1), 2 * (nR + nC) + 4);
        kr := critByDeg#(k-1); kc := critByDeg#k;
        if #kr == 0 or #kc == 0 then map(R^(#kr), R^(#kc), 0) else submatrix(A, kr, kc)
    );
    Rk := if char == 0 then R else (ZZ/char)(monoid R);
    minDiffs := minimizeOverField(redDiffs, Rk);
    minRanks := if hi == 0 then {numRows first minDiffs}
        else prepend(numRows minDiffs#0, for k from 1 to hi list numColumns minDiffs#(k-1));
    d2zero := all(for k from 2 to hi list (minDiffs#(k-2) * minDiffs#(k-1) == 0), identity);

    new HashTable from {
        "matching"       => M,
        "closing"        => clos,
        "sccs"         => sccCensus(mfc, clos),
        "sccs"       => cls,
        "determinants"   => determinants,
        "matchedDets"    => matchedDets,
        "matchedInvertible" => invertible,
        "diffs"          => minDiffs,
        "critByDeg"      => new HashTable from pairs critByDeg,
        "ranks"          => minRanks,
        "dSquaredZero"   => d2zero
    }
);
