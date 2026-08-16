

vertexToLatex = method(TypicalValue => String);
vertexToLatex(CGVertex) := String => v -> (
    if isLabeled v then (
        lab := getVertexLabel v;
        if instance(lab, Set) then (
            elems := sort toList lab;
            if #elems == 0 then "e_{\\emptyset}"
            else "e_{" | demark("", apply(elems, e -> toString e)) | "}"
        ) else "e_{" | toString lab | "}"
    ) else "e_{(" | toString(getVertexDegree v) | "," | toString(getVertexIndex v) | ")}"
);

vertexSubscript = method(TypicalValue => String);
vertexSubscript(CGVertex) := String => v -> (
    if isLabeled v then (
        lab := getVertexLabel v;
        if instance(lab, Set) then (
            elems := sort toList lab;
            if #elems == 0 then "\\varnothing"
            else demark("", apply(elems, e -> toString e))
        ) else toString lab
    ) else toString(getVertexDegree v) | "," | toString(getVertexIndex v)
);

ringEltToLatex = val -> (
    try texMath val else toString val
);

matrixToLatex = method(TypicalValue => String);
matrixToLatex(Matrix) := String => M -> (
    nR := numRows M; nC := numColumns M;
    lines := {"\\begin{pmatrix}"};
    for r from 0 to nR-1 do (
        row := for c from 0 to nC-1 list ringEltToLatex(M_(r,c));
        rowStr := demark(" & ", row);
        if r < nR-1 then rowStr = rowStr | " \\\\";
        lines = append(lines, rowStr);
    );
    lines = append(lines, "\\end{pmatrix}");
    demark("\n", lines)
);

labeledMatrixToLatex = (M, rowLabels, colLabels) -> (
    nR := numRows M; nC := numColumns M;
    colSpec := "c|" | demark("", for c from 0 to nC-1 list "c");
    lines := {"\\left(\\begin{array}{" | colSpec | "}"};
    hdr := " " | demark(" & ", for c from 0 to nC-1 list "\\scriptstyle{" | colLabels#c | "}");
	hdr = " \\  & " | hdr;
    lines = append(lines, hdr| " \\\\");
    lines = append(lines, "\\hline");
    for r from 0 to nR-1 do (
        row := {"\\scriptstyle{" | rowLabels#r | "}"};
        row = row | for c from 0 to nC-1 list ringEltToLatex(M_(r,c));
        rowStr := demark(" & ", row);
        if r < nR-1 then rowStr = rowStr | " \\\\";
        lines = append(lines, rowStr);
    );
    lines = append(lines, "\\end{array}\\right)");
    demark("\n", lines)
);

mfcDifferentialToLatex = method(TypicalValue => String);
mfcDifferentialToLatex(MutableFreeComplex, ZZ) := String => (mfc, d) -> (
    dff := getMFCDifferential(mfc, d);
    if dff === null then return "$$\\text{(no differential at degree " | toString d | ")}$$";
    "$$\\tau_{" | toString d | "} = " | matrixToLatex(matrix dff) | "$$"
);

mfcAllDifferentialsToLatex = method(TypicalValue => String);
mfcAllDifferentialsToLatex(MutableFreeComplex) := String => mfc -> (
    mfcAllDifferentialsToLatex(mfc, "\\tau")
);
mfcAllDifferentialsToLatex(MutableFreeComplex, String) := String => (mfc, sym) -> (
    lo := getMFCMinDegree mfc; hi := getMFCMaxDegree mfc;
    lines := {};
    for d from lo+1 to hi do (
        dff := getMFCDifferential(mfc, d);
        if dff =!= null then
            lines = append(lines,
                "$$" | sym | "_{" | toString d | "} = " | matrixToLatex(matrix dff) | "$$"
            );
    );
    demark("\n", lines)
);

mfcAllDifferentialsToLatexLabeled = method(TypicalValue => String);
mfcAllDifferentialsToLatexLabeled(mGrdComplexGraph, String) := String => (cg, sym) -> (
    mfc := getCGMFC cg;
    lo := getMFCMinDegree mfc; hi := getMFCMaxDegree mfc;
    byDeg := getGraphVerticesByDegree cg;
    lines := {}; 
    for d from lo+1 to hi do (
        dff := getMFCDifferential(mfc, d);
        if dff =!= null then (
            colVerts := if byDeg#?d then sortByKey(byDeg#d, v -> vertexLabelSortKey v) else {};
            rowVerts := if byDeg#?(d-1) then sortByKey(byDeg#(d-1), v -> vertexLabelSortKey v) else {};
            colLabels := for v in colVerts list vertexSubscript v;
            rowLabels := for v in rowVerts list vertexSubscript v;
            lines = append(lines,
                "$$" | sym | "_{" | toString d | "} = " | labeledMatrixToLatex(matrix dff, rowLabels, colLabels) | "$$"
            );
        );
    );
    demark("\n", lines)
);

mfcToLatex = method(TypicalValue => String);
mfcToLatex(MutableFreeComplex) := String => mfc -> (
    lo := getMFCMinDegree mfc; hi := getMFCMaxDegree mfc;
    R := toString getMFCRing mfc;
    parts := {};
    for d in reverse(lo .. hi) do (
        r := getMFCRank(mfc, d);
        rStr := if r == 1 then R else R | "^{" | toString r | "}";
        parts = append(parts, rStr);
        if d > lo then parts = append(parts, " \\xrightarrow{\\tau_{" | toString d | "}} ");
    );
    parts = append(parts, " \\to 0");
    "$$" | demark("", parts) | "$$"
);

gradientPathsToLatex = method(TypicalValue => String);
gradientPathsToLatex(CGGraph, CGVertex, CGVertex) := String => (g, src, tgt) -> (
    paths := nontrivialGradientPaths(g, src, tgt);
    if #paths == 0 then return "$$\\text{No nontrivial paths from } " | vertexToLatex src | " \\text{ to } " | vertexToLatex tgt | "$$";
    lines := {"$$\\text{Gradient paths from } " | vertexToLatex src | " \\text{ to } " | vertexToLatex tgt | ":$$"};
    lines = append(lines, "$$\\begin{align*}");
    for i from 0 to #paths - 1 do (
        pathData := paths#i;
        vertexChain := {vertexToLatex src};
        for e in pathData#0 do vertexChain = append(vertexChain, vertexToLatex getEdgeTarget e);
        line := "  &" | demark(" \\to ", vertexChain) | ", \\quad w = " | ringEltToLatex pathData#1;
        if i < #paths - 1 then line = line | " \\\\";
        lines = append(lines, line);
    );
    lines = append(lines, "\\end{align*}$$");
    demark("\n", lines)
);

matchingToLatex = method(TypicalValue => String);
matchingToLatex(List) := String => edges -> (
    if #edges == 0 then return "$$\\text{(empty matching)}$$";
    lines := {"$$\\text{Matching:}$$", "$$\\begin{align*}"};
    for i from 0 to #edges - 1 do (
        e := edges#i;
        line := "  &" | vertexToLatex(getEdgeSource e) | " \\xrightarrow{" | ringEltToLatex(getEdgeWeight e) | "} " | vertexToLatex(getEdgeTarget e);
        if i < #edges - 1 then line = line | " \\\\";
        lines = append(lines, line);
    );
    lines = append(lines, "\\end{align*}$$");
    demark("\n", lines)
);
matchingToLatex(AcyclicMatching) := String => m -> matchingToLatex(getMatchingEdges m);

graphToTikz = method(Options => {
    "edgeColor" => null, "showWeights" => true
});
graphToTikz(CGGraph) := opts -> g -> (
    byDeg := getGraphVerticesByDegree g;
    allDegs := sort keys byDeg;
    lines := {"\\begin{tikzpicture}[yscale=3.5, xscale=3, >=Stealth,",
              "  vertex/.style={align=center, font=\\small},",
              "  edge/.style={->, thick, black}]", ""};
    for d in allDegs do (
        vs := sortByKey(byDeg#d, v -> vertexLabelSortKey v);
        for i from 0 to #vs - 1 do (
            v := vs#i;
            nodeName := "n" | demark("", apply(sort toList (if isLabeled v then getVertexLabel v else set {getVertexIndex v}), e -> toString e));
            subLabel := vertexSubscript v;
            wtLabel := if isWeighted v then "\\\\" | "$" | ringEltToLatex(getVertexWeight v) | "$" else "";
            lines = append(lines, "  \\node[vertex] (" | nodeName | ") at (" | toString(i*1.5) | ", " | toString(d*1.0) | ") {$" | subLabel | "$" | wtLabel | "};");
        );
    );
    lines = append(lines, "");
    eColors := opts#"edgeColor";
    for e in getGraphEdges g do (
        src := getEdgeSource e; tgt := getEdgeTarget e;
        nameOf := v -> "n" | demark("", apply(sort toList (if isLabeled v then getVertexLabel v else set {getVertexIndex v}), x -> toString x));
        style := "edge";
        if eColors =!= null then
            for ek in keys eColors do
                if edgeEndpointsEqual(e, ek) then (style = "->, thick, " | eColors#ek; break);
        wtStr := if opts#"showWeights" then "node[pos=0.3, font=\\scriptsize] {$" | ringEltToLatex(getEdgeWeight e) | "$}" else "";
        lines = append(lines, "  \\draw[" | style | "] (" | nameOf src | ") to " | wtStr | " (" | nameOf tgt | ");");
    );
    lines = append(lines, "\\end{tikzpicture}");
    demark("\n", lines)
);
graphToTikz(ComplexGraph) := opts -> cg -> graphToTikz(getCGGraph cg, opts);

signOf = method(TypicalValue => ZZ);
signOf(RingElement) := ZZ => r -> (
    lc := try lift(leadCoefficient r, ZZ) else leadCoefficient r;
    if instance(lc, ZZ) then (
        p := char ring r;
        if p > 0 and lc > p // 2 then -1
        else if lc > 0 then 1
        else -1
    ) else (
        if lc > 0 then 1 else -1
    )
);

gradPathToLatex = method(TypicalValue => String);
gradPathToLatex(List) := String => p -> (
    verts := drop(p, -1);
    wt    := last p;
    vertStrs := for v in verts list
        "\\{" | demark(",", for x in v list toString x) | "\\}";
    "$$" | demark(" \\to ", vertStrs) | " \\quad (w=" | toString wt | ")$$"
);
