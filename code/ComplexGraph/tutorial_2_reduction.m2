-- Loads the ComplexGraph package. The default below works when you run this
-- tutorial from inside the ComplexGraph folder. If you keep the package
-- elsewhere, change FileName to point at your own copy of ComplexGraph.m2.
needsPackage("ComplexGraph", FileName => currentFileDirectory | "ComplexGraph.m2")

R = QQ[y_1..y_10]
I = {y_1*y_2*y_3*y_4*y_5, y_1*y_2*y_6*y_7*y_8, y_1*y_3*y_6*y_9*y_10,
     y_2*y_4*y_7*y_9*y_10, y_3*y_5*y_7*y_8*y_9, y_4*y_5*y_6*y_8*y_10}

cg = taylorComplexGraph(I, R)
m = bmMatchingDown cg
<< getMatchingEdgeCount m << " matched edges, morse " << isMatchingMorse m << endl

red = reduceComplexGraph(cg, m)
<< "reduced ranks " << toString mfcRankList getCGMFC red << endl
<< "is a complex " << isComplex getCGMFC red << endl

dc = reduceDiskComplex computeDiskMatching makeDiskComplex(I, R)
<< "disk " << getDCState dc << " ranks " << toString getDCRanks dc << endl
print getDCDifferentialMatrix(dc, 1)
print getDCDifferentialMatrix(dc, 2)
