-- Loads both packages. The defaults below work when you keep the GeneralAMT
-- and ComplexGraph folders side by side, as they are in this repository. If
-- you store the packages elsewhere, change each FileName to match.
needsPackage("ComplexGraph", FileName => currentFileDirectory | "../ComplexGraph/ComplexGraph.m2")
needsPackage("GeneralAMT", FileName => currentFileDirectory | "GeneralAMT.m2")

R = QQ[y_1..y_10]
I = {y_1*y_2*y_3*y_4*y_5, y_1*y_2*y_6*y_7*y_8, y_1*y_3*y_6*y_9*y_10,
     y_2*y_4*y_7*y_9*y_10, y_3*y_5*y_7*y_8*y_9, y_4*y_5*y_6*y_8*y_10}

mfc = getCGMFC taylorComplexGraph(I, R)
morse = bmMatrixMatching mfc
closed = morse | closing(mfc, morse)

-- A closed orbit is a strongly connected component of the closing.
for c in sccs(mfc, closed) do (
    D := sccMatrix(mfc, c);
    << "closed orbit  " << numRows D << " by " << numColumns D
       << "   det " << toString sub(sccDet(mfc, c), ZZ)
       << "   cycleRank " << cycleRank(mfc, closed, c) << endl)

-- det 2 is the RP2 torsion, so the orbit survives in characteristic 2.
maps = cubePrunedResolutionMapsFull(I, R)
<< "resolution check " << toString verifyResolution maps << endl
