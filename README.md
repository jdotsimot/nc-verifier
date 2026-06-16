# NC G-Code & DXF Verifier

NC Verifier is a lightweight, static client-side web application designed to help CNC programmers verify and audit G-code programs against DXF geometries and PDF blueprints before running them on the machine.

---

## 🚀 Key Features

*   **Multi-File G-Code Parsing:** Drag and drop multiple G-code files (`.nc`, `.tap`) at once. The tool aggregates all tools, feeds, speeds, and coordinates, mapping which program file each path belongs to.
*   **G-Code Only Mode:** If a DXF is not loaded, the app parses and displays the coordinate patterns, tool library, and active cycles so you can still perform visual coordinate plots and AI blueprint checks.
*   **DXF Coordinate Mapping:** Automatically matches DXF circles with G-code drill positions ($G81$-$G89$ canned cycles) using a customizable proximity tolerance (default is `0.005"`).
*   **Automatic Tap Pitch Audit:** Calculates the programmed pitch ($Feed/Spindle$ for $G94$, or $Feed$ for $G95$) and flags a warning if it doesn't match standard UNC/UNF threads.
*   **Multimodal AI Drawing Audit:** Upload customer PDF drawings directly. Gemini 2.5 Flash visually parses the drawing print to check if the G-code feature count, locations, and tool sizes match the blueprint specifications.
*   **High-Contrast Layout Views:** Switch between a Light CAD blueprint view and a Dark CAD console view for optimal canvas visibility.
*   **Secure API Key Storage:** Your Gemini API Key is saved locally in your browser's `localStorage`. It is never uploaded to a backend server or committed to GitHub.

---

## 🔧 Programmer Workflow Guide

### Step 1: Upload Your NC Programs
Since CNC jobs are often split into multiple files (e.g., T1 Drill, T57 Tap, T43 Chamfer), select and drag **all G-code programs** for the setup into the G-code upload zone. The app will combine them.

### Step 2: Choose Geometry Check Method
*   **With DXF:** Drag and drop the corresponding `.dxf` layout. The canvas will immediately highlight matched holes in **green**, missed CAD features in **red**, and stray G-code drill hits in **orange**.
*   **G-Code Only (PDF Print):** If no DXF is available, skip the DXF zone. Use the canvas plot to visually verify the coordinate pattern.

### Step 3: Run AI Drawing Analysis
1.  Enter your Gemini API Key in the top configuration bar.
2.  Upload the customer's PDF blueprint in the **AI Drawing & Blueprint Cross-Reference** panel.
3.  Click **Run AI Analysis** to generate a complete verification report.
4.  If needed, export the AI analysis report as a markdown (`.md`) file for documentation.
