-- Loads the ComplexGraph package. The default below works when you run this
-- tutorial from inside the ComplexGraph folder. If you keep the package
-- elsewhere, change FileName to point at your own copy of ComplexGraph.m2.
needsPackage("ComplexGraph", FileName => currentFileDirectory | "ComplexGraph.m2")

R = QQ[y_1..y_10]
I = {y_1*y_2*y_3*y_4*y_5, y_1*y_2*y_6*y_7*y_8, y_1*y_3*y_6*y_9*y_10,
     y_2*y_4*y_7*y_9*y_10, y_3*y_5*y_7*y_8*y_9, y_4*y_5*y_6*y_8*y_10}

cg = taylorComplexGraph(I, R)
<< getGraphVertexCount cg << " cells, " << getGraphEdgeCount cg << " edges" << endl
for d from getGraphMinDegree cg to getGraphMaxDegree cg do
    << "  degree " << d << " has " << #getGraphVerticesAtDegree(cg, d) << " cells" << endl

v = first getGraphVerticesAtDegree(cg, 2)
(<< "cell " << toString getVertexKey v
    << " at multidegree " << toString getVertexMultidegree(cg, getVertexDegree v, getVertexIndex v) << endl)
for e in getOutgoingEdges(cg, v) do (
    w := getEdgeWeight e;
    << "  to " << toString getVertexKey getEdgeTarget e
       << " weight " << toString w << (if isUnit w then " (unit)" else "") << endl)

print cubePrunedBetti(I, R)
print cubePrunedResolution(I, R)
