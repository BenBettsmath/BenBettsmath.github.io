newPackage(
    "GeneralAMT",
    Headline => "Generalized algebraic Morse theory by linear algebra",
    AuxiliaryFiles => true,
    DebuggingMode => true,
    PackageImports => {"ComplexGraph"}
);

export {
    "bridges", "rowOp", "colOp", "permuteRows", "permuteCols",
    "replacementAdjacency", "isAcyclicMatching",
    "greedyMorseMatching",
    "bmMatrixMatching", "antidiagonalBinaryMatching",
    "stronglyConnected", "sccs",
    "sccMatrix", "sccDet", "cycleRank", "sccReport",
    "closing", "degenerateClosing", "sccClass", "sccCensus", "cellPartition",
    "isMaximalMorse", "levelPairingCounts", "levelPairingExists",
    "sccsAreSeparated", "sccsAreLevelPairs",
    "isNonDegenerateClosing", "guaranteedSetting",
    "genMatchedSccs", "sccHomotopy", "genHomotopy", "hplSeries",
    "genAMTReduce", "matchedIso", "minimizeOverField",
    "minimalResolutionInChar", "cubePrunedMatchedMCCs", "closingSCCs",
    "cubePrunedClosingSCCs", "cubePrunedClosingComparison",
    "iteratedClosing", "cubePrunedResolutionMaps", "cubePrunedResolutionMapsFull",
    "mccs", "mccSummary", "mccMatching", "MaxCells",
    "mccData", "verifyResolution",
    "conleyMorsePolynomial", "conleyIndex"
};

load(currentFileDirectory | "GenAMT.m2")

end;
