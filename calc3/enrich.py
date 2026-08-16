#!/usr/bin/env python3
"""Add enrichments to tikzpictures in Chapter 15 & 16"""

with open('Calc3_Outline.tex', 'r') as f:
    content = f.read()

# Picture 1: 2D area - add dA label
content = content.replace(
    r'    \draw[red,thin] (\xx,0.4)--(\xx,\topval);' + '\n  }\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textbf{Part B. Volume in 3D.}',
    r'    \draw[red,thin] (\xx,0.4)--(\xx,\topval);' + '\n  }\n' + r'  \node[red,font=\tiny] at (1.5,0.85){$dA$};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textbf{Part B. Volume in 3D.}'
)

# Picture 2: 3D volume - add sample tile label
content = content.replace(
    r'  \draw[blue!60,thick] (3,0.4,0)--(3,0.4,{0.4+0.25*3+0.048});' + '\n' + r'\end{tikzpicture}',
    r'  \draw[blue!60,thick] (3,0.4,0)--(3,0.4,{0.4+0.25*3+0.048});' + '\n' + r'  \node[orange!70,font=\tiny] at (2.2,1.5,1.0){$dV$};' + '\n' + r'\end{tikzpicture}'
)

# Picture 3: Riemann single column
content = content.replace(
    r'  \node[blue] at (3.2,0,2.5){$z{=}f$};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\nRefining',
    r'  \node[blue] at (3.2,0,2.5){$z{=}f$};' + '\n' + r'  \node[orange!70,font=\tiny] at (0.5,0.2,0){$\Delta A$};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\nRefining'
)

# Picture 4: Riemann refined
content = content.replace(
    r'  \node[blue] at (3.2,0,2.2){$z{=}f$};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\begin{thm}[Fubini]',
    r'  \node[blue] at (3.2,0,2.2){$z{=}f$};' + '\n' + r'  \node[red,font=\tiny] at (1,0.7,0.2){$\sum$ columns};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\begin{thm}[Fubini]'
)

# Picture 5: Type I/II - make red thicker
content = content.replace(
    r'    \foreach \xx in {0.6,1.2,1.8,2.4} \draw[red] (\xx,{0.3+0.15*\xx})--(\xx,{1.6-0.2*\xx*\xx+0.1*\xx});',
    r'    \foreach \xx in {0.6,1.2,1.8,2.4} \draw[red,thick] (\xx,{0.3+0.15*\xx})--(\xx,{1.6-0.2*\xx*\xx+0.1*\xx});' + '\n' + r'    \node[red,font=\tiny] at (0.45,0.8){slice};'
)

# Picture 6: Order reversal - make red thicker
content = content.replace(
    r'    \foreach \yy in {0.3,0.7,1.1,1.4} \draw[red] ({0.3+0.4*\yy},\yy)--({2.4-0.5*\yy*\yy+0.2*\yy},\yy);',
    r'    \foreach \yy in {0.3,0.7,1.1,1.4} \draw[red,thick] ({0.3+0.4*\yy},\yy)--({2.4-0.5*\yy*\yy+0.2*\yy},\yy);' + '\n' + r'    \node[red,font=\tiny] at (-0.3,0.8){slice};'
)

# Picture 7: Polar - add angle arc
content = content.replace(
    r'  \node[font=\small] at (3,1.7){$dA=r\,dr\,d\theta$};' + '\n' + r'\end{tikzpicture}',
    r'  \node[font=\small] at (3,1.7){$dA=r\,dr\,d\theta$};' + '\n' + r'  \draw[gray,very thin,<->] (0.8,0.15) arc(0:20:0.8) node[midway,right,gray,font=\tiny]{$d\theta$};' + '\n' + r'\end{tikzpicture}'
)

# Picture 8: Lamina - add arrow
content = content.replace(
    r'  \node[orange!70!black,font=\tiny] at (2.5,1.5){$\rho\,dA$};' + '\n' + r'\end{tikzpicture}',
    r'  \node[orange!70!black,font=\tiny] at (2.5,1.5){$\rho\,dA$};' + '\n' + r'  \draw[orange,thin,->] (2.0,1.3) -- (2.3,1.5);' + '\n' + r'\end{tikzpicture}'
)

# Picture 9: Tetrahedron - annotate dz
content = content.replace(
    r'  % Vertical sample column showing dz integration' + '\n' + r'  \draw[red,thick,dashed] (0.3,0.3,0)--(0.3,0.3,{1-0.3-0.3});' + '\n' + r'  \filldraw[red] (0.3,0.3,0) circle (0.5pt) node[below,font=\tiny,red]{$(x,y,0)$};',
    r'  % Vertical sample column showing dz integration' + '\n' + r'  \draw[red,thick,dashed] (0.3,0.3,0)--(0.3,0.3,{1-0.3-0.3});' + '\n' + r'  \draw[red,<->] (0.15,0.3,0.15)--(0.15,0.3,{0.25});' + '\n' + r'  \node[red,font=\tiny] at (-0.1,0.3,0.2){$dz$};' + '\n' + r'  \filldraw[red] (0.3,0.3,0) circle (0.5pt) node[below,font=\tiny,red]{$(x,y,0)$};'
)

# Picture 10: Cylindrical - add label at origin
content = content.replace(
    r'  \filldraw[black] ({2.3*cos(65)},{2.3*sin(65)+1.2}) circle (1pt) node[above,font=\tiny]{$(r{+}dr,\theta{+}d\theta,z{+}dz)$};' + '\n' + r'\end{tikzpicture}',
    r'  \filldraw[black] ({2.3*cos(65)},{2.3*sin(65)+1.2}) circle (1pt) node[above,font=\tiny]{$(r{+}dr,\theta{+}d\theta,z{+}dz)$};' + '\n' + r'  \node[red,font=\tiny] at (0.7,-0.1){$d\theta$};' + '\n' + r'\end{tikzpicture}'
)

# Picture 11: Spherical angle - add angle arc
content = content.replace(
    r'  \draw[->,red,thick] (0,0)--({1.5*sin(50)},0) node[below,red,font=\small]{$r=\rho\sin\phi$};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textbf{Spherical wedge.}',
    r'  \draw[->,red,thick] (0,0)--({1.5*sin(50)},0) node[below,red,font=\small]{$r=\rho\sin\phi$};' + '\n' + r'  \draw[orange,very thin,<->] (0,1.2) arc(90:50:0.5) node[midway,left,orange,font=\tiny]{$d\phi$};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textbf{Spherical wedge.}'
)

# Picture 12: Spherical 3D - add volume label
content = content.replace(
    r'  \node[font=\tiny,below left] at (C){$(\rho,\phi,\theta)$};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textbf{Key relation.}',
    r'  \node[font=\tiny,below left] at (C){$(\rho,\phi,\theta)$};' + '\n' + r'  \node[purple,font=\tiny] at (1.0,0.5,0.5){$dV$};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textbf{Key relation.}'
)

# Picture 13: Spherical triangle - emphasize right angle
content = content.replace(
    r'  \draw[gray] (2.0,0) rectangle (1.85,0.15);',
    r'  \draw[gray,thick] (2.0,0) rectangle (1.85,0.15);'
)

# Picture 14: Vector field - add magnitude label
content = content.replace(
    r'  \node[red,font=\tiny] at (-0.1,1.35){$\vec F(\vec x)$};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textbf{Conservative field.}',
    r'  \node[red,font=\tiny] at (-0.1,1.35){$\vec F(\vec x)$};' + '\n' + r'  \node[red,font=\tiny] at (1.3,-0.8){mag: $|\vec F|$};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textbf{Conservative field.}'
)

# Picture 15: Conservative - add gradient label
content = content.replace(
    r'    \node[green!70,font=\small] at (0,2.1){\small curl $= 0$ \checkmark};' + '\n  ' + r'\end{scope}' + '\n  % Conservative: F = grad(x^2-y^2)',
    r'    \node[green!70,font=\small] at (0,2.1){\small curl $= 0$ \checkmark};' + '\n' + r'    \node[green!70,font=\tiny] at (0,-2.8){gradient};' + '\n  ' + r'\end{scope}' + '\n  % Conservative: F = grad(x^2-y^2)'
)

# Picture 16: Level curves - add singularity label
content = content.replace(
    r'    \filldraw[red] (0,0) circle (1.2pt);' + '\n  ' + r'\end{scope}' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textit{the fourth field has zero curl}',
    r'    \filldraw[red] (0,0) circle (1.2pt);' + '\n' + r'    \node[red,font=\tiny] at (0,-2.8){singularity};' + '\n  ' + r'\end{scope}' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textit{the fourth field has zero curl}'
)

# Picture 17: Four fields - add streamline to conservative
content = content.replace(
    r'    \node[green!60!black,font=\tiny] at (0,2.3){conservative};' + '\n  ' + r'\end{scope}' + '\n  % Conservative: F = grad(x^2-y^2)',
    r'    \node[green!60!black,font=\tiny] at (0,2.3){conservative};' + '\n' + r'    \draw[blue,very thin,->] (-0.8,-0.5)--(-0.4,-0.2);' + '\n  ' + r'\end{scope}' + '\n  % Conservative: F = grad(x^2-y^2)'
)

# Picture 18: Simply connected - add label
content = content.replace(
    r'    \draw[red,dashed,->] (0.4,0.2) ++(0.35,0) arc (0:350:0.35);' + '\n' + r'    \filldraw[red] (0.4,0.2) circle (1pt);' + '\n  ' + r'\end{scope}' + '\n  ' + r'\begin{scope}[xshift=4cm]',
    r'    \draw[red,dashed,->] (0.4,0.2) ++(0.35,0) arc (0:350:0.35);' + '\n' + r'    \filldraw[red] (0.4,0.2) circle (1pt);' + '\n' + r'    \node[blue,font=\tiny] at (0,-1.7){simply connected};' + '\n  ' + r'\end{scope}' + '\n  ' + r'\begin{scope}[xshift=4cm]'
)

# Picture 19: Line integral - add label
content = content.replace(
    r'  \node[red,font=\small] at (2.05,0.7){$ds$};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textit{fence picture}',
    r'  \node[red,font=\small] at (2.05,0.7){$ds$};' + '\n' + r'  \node[red,font=\tiny] at (1.2,0.4){arc-length element};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textit{fence picture}'
)

# Picture 20: Fence - add label
content = content.replace(
    r'  \node[teal,font=\tiny] at (3.5,2,2.0){$z=f$};' + '\n' + r'  \node[font=\tiny] at (1.5,0.4,-0.3){$C$};' + '\n' + r'\end{tikzpicture}' + '\n  \\quad' + '\n  ' + r'\begin{tikzpicture}[>=Latex,scale=1.0]',
    r'  \node[teal,font=\tiny] at (3.5,2,2.0){$z=f$};' + '\n' + r'  \node[font=\tiny] at (1.5,0.4,-0.3){$C$};' + '\n' + r'  \node[teal,font=\tiny] at (2,1,1.5){fence};' + '\n' + r'\end{tikzpicture}' + '\n  \\quad' + '\n  ' + r'\begin{tikzpicture}[>=Latex,scale=1.0]'
)

# Picture 21: Path independence - add dot
content = content.replace(
    r'  \draw[teal,thick,->] (0.5,0.4)--(3.0,1.8);' + '\n' + r'  \node[font=\small] at (2.0,-0.55){all three give $f(B)-f(A)$};' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textit{All three paths}',
    r'  \draw[teal,thick,->] (0.5,0.4)--(3.0,1.8);' + '\n' + r'  \node[font=\small] at (2.0,-0.55){all three give $f(B)-f(A)$};' + '\n' + r'  \filldraw[green!60!black] (1.6,0.95) circle (0.8pt);' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textit{All three paths}'
)

# Picture 22: Closed curve - add CCW label
content = content.replace(
    r'  \draw[blue,thick,->] (1.5,1.2) circle (0.9);' + '\n' + r'  \filldraw (2.4,1.2) circle (1.3pt);' + '\n' + r'  \node[font=\small] at (1.5,1.2){$\oint_C\vec F\cdot d\vec r=0$};' + '\n' + r'\end{tikzpicture}',
    r'  \draw[blue,thick,->] (1.5,1.2) circle (0.9);' + '\n' + r'  \filldraw (2.4,1.2) circle (1.3pt);' + '\n' + r'  \node[font=\small] at (1.5,1.2){$\oint_C\vec F\cdot d\vec r=0$};' + '\n' + r'  \node[blue,font=\tiny] at (2.5,2.0){CCW};' + '\n' + r'\end{tikzpicture}'
)

# Picture 23: Green's Theorem - add curl label
content = content.replace(
    r'      \draw[->,red,thin] (\x,\y+0.5)--++(0,-0.3);' + '\n    }' + '\n  ' + r'\end{scope}',
    r'      \draw[->,red,thin] (\x,\y+0.5)--++(0,-0.3);' + '\n    }' + '\n' + r'    \node[red,font=\tiny] at (1,0.75){curl$>0$};' + '\n  ' + r'\end{scope}'
)

# Picture 24: Annulus - add label
content = content.replace(
    r'  \node[font=\small] at (1.3,-2.3){$D$ between $C_{\rm in}$ and $C_{\rm out}$};' + '\n' + r'\end{tikzpicture}',
    r'  \node[font=\small] at (1.3,-2.3){$D$ between $C_{\rm in}$ and $C_{\rm out}$};' + '\n' + r'  \node[orange,font=\tiny] at (-1.8,1.8){$D$ on left};' + '\n' + r'\end{tikzpicture}'
)

# Picture 25: Curl and divergence - add sink label
content = content.replace(
    r'    \filldraw[red] (0,0) circle (2pt);' + '\n' + r'    \node at (0,-2.3){\small div $<0$};' + '\n  ' + r'\end{scope}' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textbf{Green',
    r'    \filldraw[red] (0,0) circle (2pt);' + '\n' + r'    \node[red,font=\tiny] at (-0.8,-0.8){sink};' + '\n' + r'    \node at (0,-2.3){\small div $<0$};' + '\n  ' + r'\end{scope}' + '\n' + r'\end{tikzpicture}' + '\n' + r'\end{center}' + '\n\n' + r'\textbf{Green'
)

with open('Calc3_Outline.tex', 'w') as f:
    f.write(content)

print("Enrichments added successfully!")
