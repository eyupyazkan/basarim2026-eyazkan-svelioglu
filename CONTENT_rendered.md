## Abstract


Abstract—Two-dimensional MXene family (Mn+1XnTx) is a potential adsorbent family for removing CO2 from natural gas, but their compositional space is far too large to explore experimentally. We present an end-to-end pipeline in which high-performance computing (HPC) and machine learning (ML) are used in tandem to screen that space. A library of 20,592 hypothetical MXenes (six sub-families, eleven transition metals, two X conformations, twelve terminations) was generated automatically, relaxed and assigned DFT-derived charges; 18,884 structures passed quality control. Grand Canonical Monte Carlo (GCMC) simulations of an equimolar CO2/CH4 mixture at 0.1, 1 and 10 bar, 56,652 independent runs, were executed in parallel on the TÜBİTAK ULAKBİM TRUBA infrastructure. The resulting dataset was used to train gradient-boosting models and a crystal graph convolutional neural network (CGCNN). On 1,886 held-out structures the CGCNN reached 99.79% classification accuracy and a mean R2 of 0.968 for six uptake targets, and the deployed model screens a structure in 1.18 s on CPU only, about 37,000 times faster than direct GCMC.

Keywords—high-performance computing, high-throughput screening, Grand Canonical Monte Carlo, MXene, Adsorption-based CO2/CH4 separation, graph neural networks, surrogate models

The full two-page extended abstract can be viewed on this page.

Source: BAŞARIM 2026 extended abstract (submitted), reported.



## 1 · Motivation & objective

### Poster text


Natural-gas sweetening removes CO2 from CH4 by pressure- or vacuum-swing adsorption, and the adsorbent sets the performance. Two-dimensional MXenes (Mn+1XnTx) can be tuned through the metal M, the X element, the layer count n and the surface group Tx: tens of thousands of compositions, of which only a handful have ever been measured.

**Objective:** screen this space end to end with automated structure generation, distributed high-throughput GCMC and a hybrid graph-neural-network surrogate that makes every simulation instantly reusable.

Key numbers on the poster:

- **20,592** structures generated
- **18,884** MXenes screened
- **56,652** GCMC simulations


### Figure


figure: none


### Read more

MXenes are a family of two-dimensional early-transition-metal carbides and nitrides, named for their M–X bonding and their "-ene" sheet morphology (thesis p. 5). The screening space combines eleven metals, two core elements and twelve surface terminations (thesis p. 14, Table 2.1). Natural gas is typically treated by pressure- or vacuum-swing adsorption, and the adsorbent dominates the process economics (thesis p. 4). The central challenge is that the composition space is far too large to explore experimentally, which motivates a computational screen (thesis p. 4).

### Numbers in this section

- 20,592 generated (reported, thesis p. 14)
- 18,884 kept (reported, thesis p. 16)
- 56,652 simulations (derived: 18,884 × 3 pressures).

## 2 · Hypothetical MXene library

### Poster text


- **M:** Sc, Ti, V, Cr, Y, Zr, Nb, Mo, Hf, Ta, W
- **X:** C or N
- **Tx:** bare, –H, –O, –OH, –F, –Cl, –Br, –I, –S, –Se, –Te, –NH2
- **Layers:** n = 2–5, P63/mmc templates

Ti2CO2, a single-metal entry (n = 2)

| Family | n = 2 | n = 3 | n = 4 | n = 5 | Total |
|---|---|---|---|---|---|
| SS · single TM | 264 | 264 | 264 | 264 | 1,056 |
| OPDT · out-of-plane double TM | 2,640 | 2,640 | – | – | 5,280 |
| IPDT · in-plane double TM | 2,640 | – | – | – | 2,640 |
| IPV · in-plane vacancy | 264 | – | – | – | 264 |
| SSM · solid solution, M site | 2,640 | 2,640 | 2,640 | 2,640 | 10,560 |
| SSX · solid solution, X site | 264 | 264 | 264 | – | 792 |
| Total generated |  |  |  |  | 20,592 |

Columns: metal layers per template (n = 2 → M2XTx … n = 5 → M5X4Tx); each template runs over 11 M × 2 X × 12 Tx = 264 chemistries.<sup>[6]</sup>

**Mn+1XnTx**


Key numbers on the poster:

- **20,592** hypothetical MXenes
- **264** chemistries per template (11 M × 2 X × 12 Tx)
- **6** MXene families (SS · OPDT · IPDT · IPV · SSM · SSX)

### Figure


- file: `poster_v2/figures/sec2_ti2co2_eyup.png`
  alt: Ti2CO2 sheet, ball-and-stick image from Materials Studio: titanium light grey, carbon dark grey, oxygen red.


### Read more

The library was generated from six MXene families reported in the literature using a Ti2CF2 unit cell as reference (thesis p. 14). Every template runs over 11 early transition metals (Ti, Ta, V, Y, Nb, Zr, Cr, Sc, W, Hf, Mo), two core elements (C, N) and twelve surface groups (thesis p. 14). A Perl workflow inside Materials Studio varied metal, C/N element and functional group in nested loops (thesis p. 16). 20,592 raw structures passed through a quality-control procedure that rejected structures whose terminations collapsed into the metal plane (1,042), whose cell angles deviated by more than ±3° after optimization (402), or whose simulation outputs were incomplete (264): 1,708 removed, 18,884 kept (thesis p. 16). The family distribution is given in thesis Table 2.1 (thesis p. 14).

### Numbers in this section

- 20,592 generated (reported, thesis p. 14)
- 18,884 kept (reported, thesis p. 16)
- 1,708 removed (reported, thesis p. 16)
- 264 chemistries per template (derived: 11 × 2 × 12).

## 3 · Automation I: scripted library generation

### Poster text


One scripted workflow sweeps every M, X and Tx over each family template, then relaxes, charges and exports every structure.

Author's estimate, hands-on time only: ≈ 10 min per structure by hand × 20,592 structures; compute time is identical on both routes.

Key numbers on the poster:

- **10 min → 0** hands-on per CIF (est.)
- **≈ 3,400 h** hands-on by hand (est.)


### Figure


- file: `poster_v2/alt/figures/cx4_sec3_workflow_hybrid.png`
  alt: One scripted workflow run once per template: family templates, composition sweep, geometry relaxation (UFF, Forcite), charge assignment and CIF export, then automated quality control from 20,592 generated structures (1,708 removed) to 18,884 validated MXenes.


### Read more

Structure generation, lattice equilibration (Forcite, UFF) and atomic-charge assignment (DMol3 ESP; settings as in thesis Table 2.3) were automated in a single Perl workflow (thesis p. 16, p. 18).

### Numbers in this section

- 10 min → 0 hands-on per CIF (estimate, author)
- ≈ 3,400 h hands-on by hand (derived from estimate: 20,592 structures × 10 min each).

## 4 · GCMC protocol & performance metrics

### Poster text


**SIMULATION SET-UP**

**6 UPTAKES + 15 DERIVED METRICS**

- **System:** rigid two-layer supercell, channel aperture ≈ 4.5 Å (lamellar Ti3C2Tx-like)
- **Mixture:** equimolar CO2/CH4, 308 K, 0.1 / 1 / 10 bar
- **Force field:** UFF + TraPPE, DFT-ESP charges, Ewald, 13.5 Å cut-off, RASPA 2.0<sup>[2–4]</sup>
- **Workload:** 56,652 independent runs, embarrassingly parallel

**Selectivity**

S = (xCO2/xCH4) · (yCH4/yCO2)

**Working Capacity, mol/kg**

ΔN = Nads − Ndes

**Regenerability**

R = ΔN / Nads × 100

**Performance Score, mol/kg**

APS = S × ΔN

**PSA:** 10 → 1 bar   **VSA:** 1 → 0.1 bar


Key numbers on the poster:

- **56,652** independent GCMC runs
- **308 K**, 0.1 / 1 / 10 bar, equimolar CO2/CH4
- **6** uptakes + **15** derived metrics

### Figure


figure: none


### Read more

Adsorption was computed with RASPA 2.0 using the UFF force field for the MXene framework and TraPPE for the gases (thesis p. 22). The CO2 model follows a TraPPE-like three-site rigid model (thesis p. 22). Every structure was simulated at three pressures, giving three CO2 and three CH4 uptakes, from which fifteen derived process metrics (selectivity, working capacity, regenerability, APS, AFM, SSP) are computed (thesis p. 36). Protocol validation: simulated CO2 isotherms for Ti3C2Tx and Mo2CTx lie inside the experimental range (poster Section 6; thesis p. 59).

### Numbers in this section

- 56,652 runs (derived: 18,884 × 3 pressures; thesis p. 22)
- 3 pressures 0.1/1/10 bar
- 308 K
- 6 uptakes + 15 derived metrics (thesis p. 36).

## 5 · Automation II: MEM-CES Studio

### Poster text


Our in-house application drives the whole GCMC campaign over pooled TRUBA accounts and the laboratory workstations: it prepares inputs, dispatches and tracks jobs, harvests and analyses results and launches the next batch. **Every run is independent, so throughput scales with the cores allocated.**

**Pool:** TRUBA student accounts, 2 × 56 cores each · project account, 4 × 56 cores

Estimate, not measured: 18,884 structures × 12–18 core-hours each (three pressures, one core per run).

Key numbers on the poster:

- **56,652** independent GCMC runs
- **12–18 h** per structure (est.)
- **0.23–0.34 M** CPU-hours in total (est.)


### Figure


- file: `poster_v2/alt/figures/cx2_sec5_studio_altA.png`
  alt: MEM-CES Studio, one app: prepare, dispatch, monitor and harvest jobs, repeated; jobs go over VPN and SSH to TRUBA student and project accounts and over the LAN to the MEM-CES simulation lab.


### Read more

The controller is the second automation layer of the ecosystem; it runs every structure to all three pressures (poster Section 5). The distributed pool spans pooled TRUBA accounts — student accounts at 2 × 56 cores each and a project account at 4 × 56 cores — and the laboratory workstations. The campaign cost is given on the poster as a thesis estimate, not a metered total: 12–18 core-hours per structure (thesis p. 86), or 0.23–0.34 M CPU-hours for all 18,884 structures (derived from that estimate).

### Numbers in this section

- 56,652 independent runs (derived)
- 12–18 h per structure (estimate, thesis p. 86)
- 0.23–0.34 M CPU-hours (derived from estimate: 18,884 × 12–18 h).

## 6 · Screening results

### Poster text


- **Universal trend:** more metal layers → higher selectivity, lower capacity
- **Capacity champions:** thin SS2 / SSM2, PSA ΔN(CO2) of 2.0–2.5 mol/kg
- **Best balance:** SSM3 and SSX3, selectivities approaching 100 at useful ΔN(CO2)
- **Record holder:** vacancy-ordered Mo1.33C, ΔN(CO2) = 3.4 mol/kg with S = 262 (PSA), at R = 36 %
- **vs. 3,816 MOFs**<sup>[5]</sup>**:** at R > 90 %, top MXenes reach APS 20–38.5 mol/kg; the best MOFs ≈ 20–30
- **Surface chemistry:** –S, –Se, –Te and –I terminations recur among the leaders

Protocol validation: simulated CO2 isotherms (this work) vs. experiments for Ti3C2Tx (a, b) and Mo2CTx (c) lie inside the experimental range.

The 20 most promising MXenes under PSA (top) and VSA (bottom), 308 K, up to 35 bar: CO2 uptake (left) approaches 5 mol/kg while CH4 (right) stays below 0.75 mol/kg; IPV Sc1.33CH2 and Ti1.33CO2 are among the leaders.


Key numbers on the poster:

- **3.4 mol/kg** ΔN(CO2), S = 262 (record holder Mo1.33C)
- **20–38.5 mol/kg** APS at R > 90 % vs. 3,816 MOFs
- **≈ 5 / < 0.75 mol/kg** CO2 / CH4 (top-20)

### Figure


- file: `poster_v2/figures/validation_isotherms_relayout.png`
  alt: Three panels of simulated versus experimental CO2 isotherms for Ti3C2Tx and Mo2CTx.

- file: `poster_v2/figures/top20_isotherms.png`
  alt: Four panels of CO2 and CH4 uptake up to 35 bar for the PSA and VSA top-20 lists; four leaders in colour.


### Read more

The record holder is vacancy-ordered Mo1.33C with ΔN(CO2) = 3.4 mol/kg and selectivity S = 262 (PSA) (thesis p. 43), at R = 36 %, which is why it sits outside the R > 90 % comparison (derived from thesis Appendix Table 2 uptakes). At 35 bar the four leaders reach 4.57–4.85 mol/kg CO2 while CH4 stays at or below 0.72 mol/kg (thesis Appendix Table 7). The MXene screen is compared against a published database of 3,816 computationally screened MOFs (thesis p. 57). Experimental validation for Ti3C2Tx and Mo2CTx appears in the protocol-validation panel (thesis p. 59).

### Numbers in this section

- top-20
- 308 K, up to 35 bar
- CO2 approaches 5 mol/kg
- CH4 < 0.75 mol/kg
- 3,816 MOFs (reported)
- APS 20–38.5 mol/kg at R > 90 %
- Mo1.33C ΔN 3.4 mol/kg, S = 262, R = 36 % (derived, thesis Appendix Table 2 uptakes).

## 7 · ML surrogates: hybrid two-stage scheme

### Poster text


Every model uses the same **hybrid classification–regression scheme**: a classifier first separates adsorbers from non-adsorbers; a regressor trained on adsorbers only predicts the six uptakes. Random Forest (bagging) is compared with XGBoost and LightGBM (boosting) on 97 descriptors, and all three with a crystal-graph network (CGCNN)<sup>[1]</sup> that reads the structure itself.


Key numbers on the poster:

- **6** uptakes + **15** derived metrics
- **97** descriptors
- **4** models (Random Forest · XGBoost · LightGBM · CGCNN)

### Figure


- file: `poster_v2/alt/figures/cx4_sec7_cgcnn_altA2.png`
  alt: CGCNN encoder (CIF, crystal graph, graph convolution, readout) feeding 1 classification, then 2 regression of six uptakes for adsorbers only, then 15 metrics; non-adsorbers stop.


### Read more

About 15 % of structures adsorb essentially nothing; feeding them to a regressor degrades it, so a gate classifier is applied first (thesis p. 34: 15.5 % non-adsorbers, CH4 < 0.01 mol/kg at 10 bar). The regressor predicts CO2 and CH4 uptakes at three pressures in one pass (thesis p. 36). CGCNN follows the original architecture of Xie and Grossman, with atoms as nodes and bonds as edges (thesis p. 33). The tree and boosting models use 97 descriptors (thesis p. 28).

### Numbers in this section

- 6 uptakes (3 pressures × 2 gases)
- 97 descriptors
- 15 derived metrics.

## 8 · Model performance

### Poster text


| Model | Classification · Acc. | Classification · MCC | Classification · AUC | Regression R² · CO2 | Regression R² · CH4 | Regression R² · Mean ± σ |
|---|---|---|---|---|---|---|
| CGCNN | 0.9979 | 0.9919 | 1.0000 | 0.951 | 0.986 | 0.968 ± 0.008 |
| XGBoost | 0.9958 | 0.9841 | 1.0000 | 0.935 | 0.987 | 0.961 ± 0.014 |
| LightGBM | 0.9963 | 0.9858 | 0.9999 | 0.935 | 0.987 | 0.961 ± 0.013 |
| Random Forest | 0.9947 | 0.9802 | 0.9998 | 0.877 | 0.978 | 0.927 ± 0.018 |

Test split. Acc. = accuracy, MCC = Matthews correlation, AUC = ROC area; R² averaged over 0.1, 1 and 10 bar (± σ over the six targets).

**HELD-OUT SET · 1,886 STRUCTURES · CGCNN vs. GCMC**

Held-out set, 1,886 structures. Left, classification head: 99.79 % accuracy with 1 false positive and 3 false negatives. Right, regression head: CGCNN vs. GCMC for CO2 uptake at 1 bar (R² = 0.974, MAE = 0.013 mol/kg, n = 1,591 adsorbers); the six uptakes reach R² = 0.972–0.991 with no systematic bias.


Key numbers on the poster:

- **99.79 %** accuracy, 1 FP / 3 FN
- **R2 = 0.968 ± 0.008** CGCNN mean
- **1,886** held-out structures

### Figure


- file: `poster_v2/alt/ref/sec8_confusion_matrix.png`
  alt: Confusion matrix on 1,886 held-out structures: 291 true non-adsorbers, 1,591 true adsorbers, 1 false positive, 3 false negatives.

- file: `poster_v2/figures/sec8_parity_plot_v2.png`
  alt: Parity plot of CGCNN versus GCMC CO2 uptake at 1 bar for 1,591 adsorbers.


### Read more

Models were evaluated on a stratified held-out test set of 1,886 structures never seen during training (thesis p. 25). The CGCNN classifier reaches 0.9979 accuracy; in the table, the CO2 and CH4 columns average the three pressures, and the overall 0.968 ± 0.008 averages all six targets (thesis p. 68, Table 4.4). Boosting (XGBoost, LightGBM) follows closely, showing the hybrid scheme — not a single algorithm — is the main driver of accuracy (thesis p. 68).

### Numbers in this section

- 1,886 held-out
- 99.79 % accuracy
- 1 FP / 3 FN
- R2 = 0.968 ± 0.008 (CGCNN mean)
- R2 = 0.974 at 1 bar
- MAE 0.013 mol/kg.

## 9 · Deployed screening interface

### Poster text


Schematic of the deployed Gradio tool; values from the batch run on the held-out set. 1,886 CIFs: 37 min on one 128-thread CPU.

Key numbers on the poster:

- **1.18 s** per structure, CPU
- **≈ 37,000×** vs one CPU core (est.)


### Figure


- file: `poster_v2/figures/interface_v1_screen_fixed.png`
  alt: Stylised view of the screening interface: structure selection, 3D crystal structure, classification gauge, predicted selectivity and working capacity, and derived process metrics.


### Read more

The deployed Gradio tool labels atoms, builds the crystal graph and returns the prediction in about one second on a CPU (thesis p. 86, p. 91). The 1,886-structure held-out batch ran in 37 minutes on one 128-thread AMD EPYC 7763 (poster Section 9). The "≈ 37,000×" compares per-structure surrogate time against direct GCMC on one CPU core; it uses the thesis estimate of 12–18 h of single-core GCMC per structure as its base, so it is labeled (est.).

### Numbers in this section

- 1.18 s per structure (derived: 2,219.9 s / 1,886)
- ≈ 37,000× vs one core (derived from estimate, 12 h base)
- 1,886 CIFs, 37 min, 128-thread CPU.

## 10 · Conclusions

### Poster text


- **HPC invested once, amortized forever:** 56,652 GCMC runs become a surrogate that answers in about one second with R² ≈ 0.97.
- **Two automation layers made the scale possible:** scripted structure generation and MEM-CES Studio campaign control.
- **Hybrid scheme:** non-adsorbers are separated before any uptake is predicted, so every prediction stays physical.
- **Next:** ML potentials and charge models to replace relaxation and DFT charges; an extended library is under way.


Key numbers on the poster:

- **56,652** GCMC runs
- **about one second** per structure
- **R2 ≈ 0.97**

### Figure


figure: none


### Read more

Future work includes relaxing each structure with machine-learned interatomic potentials and predicting the DFT partial charges with a second network trained on them (thesis p. 92). The library is not yet released; it is planned as an open resource (thesis p. 90).

### Numbers in this section

- 56,652 runs
- about one second
- R2 ≈ 0.97.

## References


1. Xie, T., Grossman, J. C., 2018. *Physical Review Letters*, 120(14), 145301 (CGCNN).
2. Dubbeldam, D., et al., 2016. *Molecular Simulation*, 42(2), 81-101.
3. Rappé, A. K., et al., 1992. *JACS*, 114(25), 10024-10035 (UFF).
4. Potoff, J. J., Siepmann, J. I., 2001. *AIChE Journal*, 47(7), 1676-1682 (TraPPE).
5. Altintas, C., et al., 2018. *ACS Appl. Mater. Interfaces*, 10(20), 17257-17268 (3,816 MOFs).
6. Ahmed, B., et al., 2020. *Adv. Funct. Mater.*, 30(47), 2000894 (MXene families).



## Contact & questions


- **Contact:** eyazkan@gtu.edu.tr (Eyüp Yazkan) · sadiye.velioglu@itu.edu.tr (Sadiye Velioğlu)


