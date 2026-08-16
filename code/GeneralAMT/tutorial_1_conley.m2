-- Loads both packages. The defaults below work when you keep the GeneralAMT
-- and ComplexGraph folders side by side, as they are in this repository. If
-- you store the packages elsewhere, change each FileName to match.
needsPackage("ComplexGraph", FileName => currentFileDirectory | "../ComplexGraph/ComplexGraph.m2")
needsPackage("GeneralAMT", FileName => currentFileDirectory | "GeneralAMT.m2")

R = QQ[y_1..y_10]
I = {y_1*y_2*y_3*y_4*y_5, y_1*y_2*y_6*y_7*y_8, y_1*y_3*y_6*y_9*y_10,
     y_2*y_4*y_7*y_9*y_10, y_3*y_5*y_7*y_8*y_9, y_4*y_5*y_6*y_8*y_10}

sd = mccData(I, R)
<< "betti " << toString sd#"betti" << "   bad primes " << toString sd#"badPrimes" << endl
for s in sd#"mccs" do if s#"nCells" > 1 then (
    << "  mcc at " << toString s#"multidegree" << " over degrees " << toString s#"degrees"
       << " homology " << toString s#"betti" << endl)

-- The mcc homology H_*(Gflat_b) is the Conley index CH_*(b).
<< "rational Conley indices" << endl
for ci in conleyIndex(I, R) do << "  b " << toString ci#"multidegree" << "   p_b(t) = " << ci#"poincare" << endl
<< "characteristic 2 Conley indices" << endl
for ci in conleyIndex(I, R, 2) do << "  b " << toString ci#"multidegree" << "   p_b(t) = " << ci#"poincare" << endl

-- sum_b p_b(t) = B(t) + (1+t) q(t).
cm0 = conleyMorsePolynomial(I, R)
cm2 = conleyMorsePolynomial(I, R, 2)
<< "char 0   P " << cm0#"Pstring" << "   B " << cm0#"Bstring" << "   q " << cm0#"qString" << endl
<< "char 2   P " << cm2#"Pstring" << "   B " << cm2#"Bstring" << "   q " << cm2#"qString" << endl
