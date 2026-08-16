newPackage(
    "ComplexGraph",
    Version => "3.1.0",
    Date => "June 2026",
    Headline => "ComplexGraph",
    AuxiliaryFiles => true,
    DebuggingMode => true
);

export {
    "CGVertex", "CGEdge", "CGGraph",
    "makeCGVertex",
    "getVertexDegree", "getVertexIndex", "getVertexWeight", "getVertexLabel",
    "getVertexKey", "isWeighted", "isLabeled",
    "addWeight", "addLabel", "addWeightAndLabel",
    "stripWeight", "stripLabel", "stripDecorations",
    "makeCGEdge",
    "getEdgeSource", "getEdgeTarget", "getEdgeWeight",
    "getEdgeSourceDegree", "getEdgeTargetDegree",
    "setEdgeWeight", "flipEdge",
    "intEdgeCoeff", "stripEdgeWeight", "stripEdgeWeights",
    "makeCGGraph", "flipGraphEdges",
    "addGraphVertexWeights", "addGraphVertexLabels", "addEdges",
    "getGraphVertices", "getGraphEdges",
    "getGraphVertexCount", "getGraphEdgeCount",
    "getGraphVerticesByDegree", "getGraphVerticesAtDegree",
    "getGraphMinDegree", "getGraphMaxDegree",
    "getOutgoingEdges", "getIncomingEdges",
    "getOutgoingVertices", "getIncomingVertices",
    "findVertexByKey", "findVertexByLabel",
    "hasEdge", "edgesBetweenDegrees", "subgraph",
    "vertexEqual", "edgeEqual", "edgeEndpointsEqual", "sortByKey",

    "MutableFreeComplex",
    "makeMutableFreeComplex",
    "getMFCRing", "getMFCMinDegree", "getMFCMaxDegree",
    "getMFCRank", "getMFCModule", "getMFCDifferential", "getMFCEntry",
    "mfcMatrixAt", "mfcRankList",
    "setMFCEntry", "addToMFCEntry",
    "isComplex",
    "permuteMFCAtDegree",

    "ComplexGraph", "mGrdComplexGraph",
    "makeComplexGraph", "complexGraphFromMFC", "makeMGrdComplexGraph",
    "getVertexMultidegree",
    "taylorComplexGraph", "orderedTaylorMFC",
    "buildComplexGraph", "buildTaylorVertices", "edgesFromMFCWithVertices",
    "getCGGraph", "getCGMFC", "getCGRing", "getCGEdgeWeight", "setCGEdgeWeight",
    "syncGraphFromMFC", "graphFromMFC", "assignVertexLabels",
    "reorderVerticesAtDegree",
    "vertexLabelSortKey",

    "AcyclicMatching", "makeAcyclicMatching",
    "getMatchingEdges", "getMatchingEdgeCount",
    "isMatchedVertex", "getMatchedEdge",
    "isMatchingHomogeneous", "isMatchingAcyclic", "isMatchingMorse",
    "criticalVertices",
    "bmMatchingDown", "greedyDown", "bmMatchingUp", "prunedMatching",

    "gradientPaths", "computeGamma", "nontrivialGradientPaths", "reachableDegreeOne",
    "GammaMatrixDown", "GammaMatrixUp",
    "reduceComplexGraph",
    "gradientPathSummary",

    "vertexToLatex", "vertexSubscript",
    "ringEltToLatex",
    "matrixToLatex",
    "mfcDifferentialToLatex", "mfcAllDifferentialsToLatex", "mfcToLatex",
    "mfcAllDifferentialsToLatexLabeled", "labeledMatrixToLatex",
    "gradientPathsToLatex", "matchingToLatex", "graphToTikz",
    "gradPathToLatex",
    "signOf",

    "lexSubsets", "buildSubsetIndex", "lexSubsetAtIndex",
    "expVecLcm", "expVecDiv", "expVecToString", "stringToExpVec",

    "DiskComplex",
    "makeDiskComplex", "openDiskComplex",
    "computeDiskMatching",
    "reduceDiskComplex",
    "diskComplexToMFC",
    "diskComplexToComplexGraph",
    "getDCRing", "getDCState", "getDCRanks", "getDCNumGens", "getDCGens", "getDCDbPath",
    "getDCMatchPairs",
    "getDCCriticalSubsets",
    "getDCDifferentialMatrix",
    "buildKeyToSubsetFromDC",
    "matchingDiskToEdgeList",
    "persistAdjList", "loadAdjList",
    "traceGradientPathsDisk",
    "diskGradientPathLabels",
    "cubePrunedBetti", "cubePrunedMatching",
    "cubePrunedResolution", "cubeMCCCells", "cubeMCCComplex",
    "cubePrunedResolutionPrimes",

    "ReturnMatching"
};

load(currentFileDirectory | "Types.m2")
load(currentFileDirectory | "Algorithms.m2")
load(currentFileDirectory | "LatexOutput.m2")
load(currentFileDirectory | "DiskDB.m2")
load(currentFileDirectory | "DiskComplex.m2")

end;
