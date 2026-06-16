// App state variables
let gcodeData = null;
let dxfData = null;
let matchedResults = null;
let apiKey = '';
let tolerance = 0.005;
let canvasTheme = 'light';
let pdfBase64 = null;
let currentAiReportRaw = '';

// Canvas state for zoom & pan
let scale = 1.0;
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let startX, startY;
const canvas = document.getElementById('canvas-view');
const ctx = canvas.getContext('2d');

// Standard Thread Pitches (TPI to Pitch in inches)
const STANDARD_THREATS = [
    { name: "10-24 UNC", tpi: 24, pitch: 1/24 },
    { name: "10-32 UNF", tpi: 32, pitch: 1/32 },
    { name: "1/4-20 UNC", tpi: 20, pitch: 1/20 },
    { name: "1/4-28 UNF", tpi: 28, pitch: 1/28 },
    { name: "5/16-18 UNC", tpi: 18, pitch: 1/18 },
    { name: "5/16-24 UNF", tpi: 24, pitch: 1/24 },
    { name: "3/8-16 UNC", tpi: 16, pitch: 1/16 },
    { name: "3/8-24 UNF", tpi: 24, pitch: 1/24 },
    { name: "7/16-14 UNC", tpi: 14, pitch: 1/14 },
    { name: "7/16-20 UNF", tpi: 20, pitch: 1/20 },
    { name: "1/2-13 UNC", tpi: 13, pitch: 1/13 },
    { name: "1/2-20 UNF", tpi: 20, pitch: 1/20 },
    { name: "5/8-11 UNC", tpi: 11, pitch: 1/11 },
    { name: "5/8-18 UNF", tpi: 18, pitch: 1/18 },
    { name: "3/4-10 UNC", tpi: 10, pitch: 1/10 },
    { name: "3/4-16 UNF", tpi: 16, pitch: 1/16 }
];

// Load settings from local storage
window.addEventListener('DOMContentLoaded', () => {
    // Load API Key
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        document.getElementById('api-key-input').value = savedKey;
        apiKey = savedKey;
    }

    // Handle API key input change
    document.getElementById('api-key-input').addEventListener('change', (e) => {
        apiKey = e.target.value.trim();
        localStorage.setItem('gemini_api_key', apiKey);
    });

    // Handle Tolerance Change
    document.getElementById('tolerance-input').addEventListener('change', (e) => {
        tolerance = parseFloat(e.target.value) || 0.005;
        if (gcodeData && dxfData) {
            compareData();
        }
    });

    // Setup drag & drop handlers
    setupDragDrop('drop-gcode', 'file-gcode', handleGcodeFiles);
    setupDragDrop('drop-dxf', 'file-dxf', handleDxfFile);

    // Resize canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Canvas interactivity
    setupCanvasControls();
});

function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth - 32;
    canvas.height = 450;
    drawWorkspace();
}

// Setup drag and drop zones
function setupDragDrop(cardId, inputId, handler) {
    const card = document.getElementById(cardId);
    const input = document.getElementById(inputId);

    card.addEventListener('click', () => input.click());

    card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.classList.add('dragover');
    });

    card.addEventListener('dragleave', () => {
        card.classList.remove('dragover');
    });

    card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            input.files = e.dataTransfer.files;
            if (input.multiple) {
                handler(e.dataTransfer.files);
            } else {
                handler(e.dataTransfer.files[0]);
            }
        }
    });

    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            if (input.multiple) {
                handler(e.target.files);
            } else {
                handler(e.target.files[0]);
            }
        }
    });
}

// G-code File Handler
function handleGcodeFiles(files) {
    const status = document.getElementById('status-gcode');
    status.style.display = 'block';
    status.textContent = `Reading ${files.length} G-code file(s)...`;
    status.style.color = 'var(--text-secondary)';

    let loadedCount = 0;
    const combinedPoints = [];
    const combinedTools = {};

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;
            const parsed = parseGcode(text, file.name);
            combinedPoints.push(...parsed.points);
            Object.assign(combinedTools, parsed.tools);
            
            loadedCount++;
            if (loadedCount === files.length) {
                gcodeData = { points: combinedPoints, tools: combinedTools };
                status.textContent = `Loaded ${files.length} G-code file(s): ${gcodeData.points.length} total drill points.`;
                status.style.color = 'var(--success)';
                checkAndCompare();
            }
        };
        reader.readAsText(file);
    }
}

// DXF File Handler
function handleDxfFile(file) {
    const status = document.getElementById('status-dxf');
    status.style.display = 'block';
    status.textContent = `Reading ${file.name}...`;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        dxfData = parseDxf(text);
        status.textContent = `Loaded DXF: ${dxfData.length} circles found.`;
        status.style.color = 'var(--success)';
        checkAndCompare();
    };
    reader.readAsText(file);
}

// Verify files and run check
function checkAndCompare() {
    if (gcodeData) {
        if (dxfData) {
            compareData();
        } else {
            renderGcodeOnlyReport();
        }
    }
}

function resetAll() {
    gcodeData = null;
    dxfData = null;
    matchedResults = null;
    document.getElementById('file-gcode').value = '';
    document.getElementById('file-dxf').value = '';
    document.getElementById('status-gcode').style.display = 'none';
    document.getElementById('status-dxf').style.display = 'none';
    document.getElementById('alert-list').innerHTML = `
        <div class="alert-item warning" style="border-left-color: var(--warning);">
            <div class="alert-title">Pending Files</div>
            <div class="alert-desc">Please drag and drop G-code and DXF to start.</div>
        </div>`;
    document.getElementById('tools-table-body').innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No tools parsed yet.</td></tr>`;
    document.getElementById('coords-table-body').innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">No geometry processed yet.</td></tr>`;
    document.getElementById('audit-summary-badge').textContent = 'No Data';
    document.getElementById('ai-response-container').style.display = 'none';
    document.getElementById('btn-export-ai').style.display = 'none';
    currentAiReportRaw = '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// G-code parsing logic
function parseGcode(text, fileName = 'Unknown') {
    const lines = text.split('\n');
    const points = [];
    const tools = {};

    let currentTool = 'T0';
    let currentToolDesc = 'Unknown Tool';
    let currentSpindle = 0;
    let currentFeed = 0;
    let isMetric = false; // default G20 (inches)

    // Modal state for G-code canned cycles
    let inCannedCycle = false;
    let cannedCycleGCode = '';
    let currentZ = 0;
    let lastX = 0;
    let lastY = 0;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].toUpperCase().split(';')[0].split('(')[0].trim(); // strip inline comments for coords
        const fullLine = lines[i].trim();

        // Extract tool description from parenthesis comment
        if (fullLine.includes('(') && fullLine.includes(')')) {
            const comment = fullLine.substring(fullLine.indexOf('(') + 1, fullLine.indexOf(')'));
            if (fullLine.includes('T') && !fullLine.includes('G')) {
                const toolMatch = fullLine.match(/T\s*(\d+)/i);
                if (toolMatch) {
                    const toolNum = 'T' + parseInt(toolMatch[1]);
                    tools[toolNum] = comment.trim();
                }
            } else if (fullLine.startsWith('(')) {
                // If line starts with a comment, associate it with the upcoming or current tool
                currentToolDesc = comment.trim();
            }
        }

        // Parse Tool Call
        const tMatch = line.match(/T\s*(\d+)/);
        if (tMatch) {
            currentTool = 'T' + parseInt(tMatch[1]);
            if (!tools[currentTool]) {
                tools[currentTool] = currentToolDesc || 'Unknown Tool';
            }
        }

        // Feed units
        if (line.includes('G21')) isMetric = true;
        if (line.includes('G20')) isMetric = false;

        // Parse Spindle
        const sMatch = line.match(/S\s*(\d+)/);
        if (sMatch) {
            currentSpindle = parseInt(sMatch[1]);
        }

        // Parse Feed
        const fMatch = line.match(/F\s*([\d.]+)/);
        if (fMatch) {
            currentFeed = parseFloat(fMatch[1]);
        }

        // Detect canned cycle start
        // G73, G81, G82, G83 (drill), G84 (tap), G85 (bore)
        const gCycleMatch = line.match(/G\s*(73|81|82|83|84|85)/);
        if (gCycleMatch) {
            inCannedCycle = true;
            cannedCycleGCode = 'G' + gCycleMatch[1];
        }

        // Detect canned cycle end G80 or other motions G00/G01
        if (line.includes('G80') || line.match(/G\s*(00|01|02|03)\b/)) {
            inCannedCycle = false;
        }

        // Modal coordinate tracking
        const xMatch = line.match(/X\s*(-?[\d.]+)/);
        const yMatch = line.match(/Y\s*(-?[\d.]+)/);
        const zMatch = line.match(/Z\s*(-?[\d.]+)/);

        if (xMatch) lastX = parseFloat(xMatch[1]);
        if (yMatch) lastY = parseFloat(yMatch[1]);
        if (zMatch) currentZ = parseFloat(zMatch[1]);

        // If in canned cycle, and coordinates are updated (or we just entered the cycle)
        if (inCannedCycle && (xMatch || yMatch || gCycleMatch)) {
            // Convert to inches if metric
            const finalX = isMetric ? lastX / 25.4 : lastX;
            const finalY = isMetric ? lastY / 25.4 : lastY;

            points.push({
                x: finalX,
                y: finalY,
                z: currentZ,
                gcode: cannedCycleGCode,
                tool: currentTool,
                toolDesc: tools[currentTool] || 'Unknown',
                spindle: currentSpindle,
                feed: currentFeed,
                isTap: cannedCycleGCode === 'G84' || (tools[currentTool] && tools[currentTool].toUpperCase().includes('TAP')),
                lineNum: i + 1,
                fileName: fileName,
                matched: false
            });
        }
    }

    return { points, tools };
}

// DXF Parser (Extremely fast, pure JS CIRCLE entity parser)
function parseDxf(text) {
    const lines = text.split(/\r?\n/);
    const circles = [];
    let i = 0;

    while (i < lines.length) {
        let line = lines[i].trim();
        if (line === 'CIRCLE') {
            let cx = 0, cy = 0, cz = 0, r = 0;
            // Scan next lines until we hit another entity
            i++;
            while (i < lines.length) {
                let code = lines[i].trim();
                let value = lines[i+1] ? lines[i+1].trim() : '';

                if (isNaN(parseInt(code))) {
                    // Reached next entity type
                    i--;
                    break;
                }

                const groupCode = parseInt(code);
                if (groupCode === 10) cx = parseFloat(value); // center X
                if (groupCode === 20) cy = parseFloat(value); // center Y
                if (groupCode === 30) cz = parseFloat(value); // center Z
                if (groupCode === 40) r = parseFloat(value);  // radius

                i += 2;
            }

            circles.push({
                x: cx,
                y: cy,
                z: cz,
                radius: r,
                diameter: r * 2,
                source: 'DXF',
                matched: false
            });
        } else {
            i++;
        }
    }

    return circles;
}

// Match coordinates and run audit algorithms
function compareData() {
    // Reset matches
    gcodeData.points.forEach(p => p.matched = false);
    dxfData.forEach(c => c.matched = false);

    const matchedList = [];
    const missedDxf = [];
    const strayGcode = [];

    // 1. Proximity matching
    gcodeData.points.forEach((gp) => {
        let bestMatch = null;
        let minDistance = Infinity;

        dxfData.forEach((dc) => {
            const dist = Math.sqrt(Math.pow(gp.x - dc.x, 2) + Math.pow(gp.y - dc.y, 2));
            if (dist < minDistance && dist <= tolerance) {
                minDistance = dist;
                bestMatch = dc;
            }
        });

        if (bestMatch) {
            gp.matched = true;
            bestMatch.matched = true;
            gp.diameter = bestMatch.diameter;
            matchedList.push({
                gcode: gp,
                dxf: bestMatch,
                distance: minDistance
            });
        } else {
            strayGcode.push(gp);
        }
    });

    dxfData.forEach((dc) => {
        if (!dc.matched) {
            missedDxf.push(dc);
        }
    });

    matchedResults = { matchedList, missedDxf, strayGcode };

    // Build the visual rendering mapping
    fitViewToPoints();
    drawWorkspace();

    // Render tables and alerts
    renderReport();
}

// UI Rendering Logic for tables & alerts
function renderReport() {
    const alertList = document.getElementById('alert-list');
    alertList.innerHTML = '';

    const toolsTableBody = document.getElementById('tools-table-body');
    toolsTableBody.innerHTML = '';

    const coordsTableBody = document.getElementById('coords-table-body');
    coordsTableBody.innerHTML = '';

    let totalErrors = 0;
    let totalWarnings = 0;

    // A. Tools Summary Table & Tap Checks
    const activeTools = Object.keys(gcodeData.tools);
    if (activeTools.length === 0) {
        toolsTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No tools parsed.</td></tr>`;
    } else {
        activeTools.forEach(t => {
            const desc = gcodeData.tools[t];
            const uses = gcodeData.points.filter(p => p.tool === t);
            const isTap = uses.some(p => p.isTap);

            let cycleInfo = uses.length > 0 ? `${uses[0].gcode} (${uses.length} holes)` : 'Unused';
            let tapCheckSpan = '<span style="color: var(--text-secondary);">N/A</span>';

            if (isTap && uses.length > 0) {
                const gp = uses[0];
                const spindle = gp.spindle;
                const feed = gp.feed;

                if (spindle > 0 && feed > 0) {
                    const calculatedPitch = feed / spindle; // For standard IPM / RPM
                    const calcTpi = 1 / calculatedPitch;

                    // Match against standard thread specs
                    let closestThread = null;
                    let bestDev = Infinity;
                    STANDARD_THREATS.forEach(st => {
                        const dev = Math.abs(st.pitch - calculatedPitch);
                        if (dev < bestDev) {
                            bestDev = dev;
                            closestThread = st;
                        }
                    });

                    // Margin of error for TPI match
                    if (bestDev < 0.005) {
                        tapCheckSpan = `<span style="color: var(--success); font-weight: 500;">Matches ${closestThread.name} (${closestThread.tpi} TPI)</span>`;
                    } else {
                        totalWarnings++;
                        tapCheckSpan = `<span style="color: var(--warning); font-weight: 500;">Non-Std Pitch: ${calcTpi.toFixed(1)} TPI (F:${feed}/S:${spindle})</span>`;
                        
                        // Push warning alert
                        addAlert(
                            'warning',
                            `Tool ${t} (${desc}) Tapping Verification Warning`,
                            `Calculated TPI of ${calcTpi.toFixed(2)} (Pitch: ${calculatedPitch.toFixed(4)}") does not match standard tap sizing pitch. Feed: F${feed}, Spindle: S${spindle}.`
                        );
                    }
                } else {
                    totalWarnings++;
                    tapCheckSpan = `<span style="color: var(--error); font-weight: 500;">Missing F/S values</span>`;
                }
            }

            toolsTableBody.innerHTML += `
                <tr>
                    <td><strong>${t}</strong></td>
                    <td>${desc}</td>
                    <td>${cycleInfo}</td>
                    <td>${tapCheckSpan}</td>
                </tr>
            `;
        });
    }

    // B. Hole Mismatch Alerts
    if (matchedResults.missedDxf.length > 0) {
        totalErrors += matchedResults.missedDxf.length;
        matchedResults.missedDxf.forEach(md => {
            addAlert(
                'error',
                'Missed CAD Hole',
                `A circle of diameter ${md.diameter.toFixed(4)}" at X: ${md.x.toFixed(4)}, Y: ${md.y.toFixed(4)} exists in the DXF model, but has no matching G-code drilling operation.`
            );
        });
    }

    if (matchedResults.strayGcode.length > 0) {
        totalWarnings += matchedResults.strayGcode.length;
        matchedResults.strayGcode.forEach(sg => {
            addAlert(
                'warning',
                'Stray G-code Hole Location',
                `G-code toolpath performs a ${sg.gcode} drill command with tool ${sg.tool} at X: ${sg.x.toFixed(4)}, Y: ${sg.y.toFixed(4)} (Line ${sg.lineNum}), but no matching circle is found in the DXF file.`
            );
        });
    }

    // Success indicator if 100% matched
    if (totalErrors === 0 && totalWarnings === 0) {
        addAlert(
            'success',
            'All Features Verified',
            `All ${matchedResults.matchedList.length} programmed hole features successfully align with CAD model constraints within ${tolerance}" tolerance.`
        );
    }

    // Update summary badge
    const badge = document.getElementById('audit-summary-badge');
    if (totalErrors > 0) {
        badge.textContent = `${totalErrors} Errors | ${totalWarnings} Warnings`;
        badge.style.background = 'rgba(239, 68, 68, 0.2)';
        badge.style.color = 'var(--error)';
    } else if (totalWarnings > 0) {
        badge.textContent = `${totalWarnings} Warnings`;
        badge.style.background = 'rgba(245, 158, 11, 0.2)';
        badge.style.color = 'var(--warning)';
    } else {
        badge.textContent = '100% Matched';
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
        badge.style.color = 'var(--success)';
    }

    // C. Coordinates Table List
    // Add DXF Circles first
    dxfData.forEach(dc => {
        coordsTableBody.innerHTML += `
            <tr>
                <td>DXF Model</td>
                <td>X: ${dc.x.toFixed(4)}</td>
                <td>Y: ${dc.y.toFixed(4)}</td>
                <td>Ø ${dc.diameter.toFixed(4)}"</td>
                <td><span style="color: ${dc.matched ? 'var(--success)' : 'var(--error)'};">${dc.matched ? 'Matched' : 'Missed'}</span></td>
            </tr>
        `;
    });

    // Add Stray G-code operations
    matchedResults.strayGcode.forEach(sg => {
        coordsTableBody.innerHTML += `
            <tr style="background: rgba(245, 158, 11, 0.05);">
                <td>G-Code Stray</td>
                <td>X: ${sg.x.toFixed(4)}</td>
                <td>Y: ${sg.y.toFixed(4)}</td>
                <td>N/A</td>
                <td><span style="color: var(--warning);">No CAD Circle</span></td>
            </tr>
        `;
    });
}

function addAlert(type, title, desc) {
    const alertList = document.getElementById('alert-list');
    alertList.innerHTML += `
        <div class="alert-item ${type}">
            <div class="alert-title">${title}</div>
            <div class="alert-desc">${desc}</div>
        </div>
    `;
}

// Canvas rendering algorithms
function fitViewToPoints() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    // Gather coordinates from all sources
    const allCoords = [];
    if (dxfData) dxfData.forEach(c => allCoords.push({ x: c.x, y: c.y }));
    if (gcodeData) gcodeData.points.forEach(p => allCoords.push({ x: p.x, y: p.y }));

    if (allCoords.length === 0) return;

    allCoords.forEach(c => {
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.y > maxY) maxY = c.y;
    });

    // Handle single point
    if (maxX === minX) { maxX += 1; minX -= 1; }
    if (maxY === minY) { maxY += 1; minY -= 1; }

    const border = 0.5; // half-inch margin
    minX -= border; maxX += border;
    minY -= border; maxY += border;

    const width = maxX - minX;
    const height = maxY - minY;

    // Scale to fit canvas
    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    scale = Math.min(scaleX, scaleY) * 0.9;

    // Center geometry on canvas
    offsetX = (canvas.width - (minX + maxX) * scale) / 2;
    offsetY = (canvas.height - (minY + maxY) * scale) / 2;
}

function resetCanvasView() {
    if (gcodeData || dxfData) {
        fitViewToPoints();
        drawWorkspace();
    }
}

function drawWorkspace() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Theme Background & Grid Style
    if (canvasTheme === 'light') {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#cbd5e1';
    } else {
        ctx.fillStyle = '#090b0e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#1a1f29';
    }

    ctx.lineWidth = 0.5;
    const gridSpacing = 1.0; // 1 inch grid lines
    const startGridX = Math.floor((-offsetX / scale) / gridSpacing) * gridSpacing;
    const endGridX = Math.ceil(((canvas.width - offsetX) / scale) / gridSpacing) * gridSpacing;
    const startGridY = Math.floor((-offsetY / scale) / gridSpacing) * gridSpacing;
    const endGridY = Math.ceil(((canvas.height - offsetY) / scale) / gridSpacing) * gridSpacing;

    for (let x = startGridX; x <= endGridX; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x * scale + offsetX, 0);
        ctx.lineTo(x * scale + offsetX, canvas.height);
        ctx.stroke();
    }
    for (let y = startGridY; y <= endGridY; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y * scale + offsetY);
        ctx.lineTo(canvas.width, y * scale + offsetY);
        ctx.stroke();
    }

    if (!gcodeData && !dxfData) {
        // Draw centered guide text
        ctx.fillStyle = canvasTheme === 'light' ? '#475569' : 'var(--text-secondary)';
        ctx.font = '14px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText('Workspace preview is empty. Load files above.', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Draw DXF Circles
    if (dxfData) {
        dxfData.forEach(c => {
            const screenX = c.x * scale + offsetX;
            const screenY = c.y * scale + offsetY;
            const screenRadius = c.radius * scale;

            ctx.beginPath();
            ctx.arc(screenX, screenY, screenRadius, 0, 2 * Math.PI);
            ctx.lineWidth = 2;
            
            if (c.matched) {
                ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)'; // Green
                ctx.fillStyle = 'rgba(16, 185, 129, 0.05)';
            } else {
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'; // Red
                ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';

                // Draw red missed indicator cross
                ctx.beginPath();
                ctx.moveTo(screenX - 8, screenY);
                ctx.lineTo(screenX + 8, screenY);
                ctx.moveTo(screenX, screenY - 8);
                ctx.lineTo(screenX, screenY + 8);
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
                ctx.stroke();
            }
            ctx.fill();
            ctx.stroke();

            // Label circle size
            ctx.fillStyle = canvasTheme === 'light' ? '#475569' : 'var(--text-secondary)';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${(c.diameter).toFixed(3)}"`, screenX, screenY + screenRadius + 12);
        });
    }

    // Draw G-code Toolpath Drill Coordinates
    if (gcodeData) {
        gcodeData.points.forEach(gp => {
            const screenX = gp.x * scale + offsetX;
            const screenY = gp.y * scale + offsetY;

            if (gp.matched) {
                // Draw a cyan inner target dot inside the circle
                ctx.fillStyle = 'var(--accent-primary)';
                ctx.beginPath();
                ctx.arc(screenX, screenY, 4, 0, 2 * Math.PI);
                ctx.fill();
            } else {
                // Draw warning marker (orange crosshair)
                ctx.strokeStyle = 'var(--warning)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(screenX, screenY, 6, 0, 2 * Math.PI);
                ctx.moveTo(screenX - 10, screenY);
                ctx.lineTo(screenX + 10, screenY);
                ctx.moveTo(screenX, screenY - 10);
                ctx.lineTo(screenX, screenY + 10);
                ctx.stroke();

                // Draw tooltip label nearby
                ctx.fillStyle = 'var(--warning)';
                ctx.font = '9px monospace';
                ctx.textAlign = 'left';
                ctx.fillText(`Stray Drill: Line ${gp.lineNum}`, screenX + 12, screenY - 2);
            }
        });
    }
}

// Interactive Canvas Controls (Zoom/Pan)
function setupCanvasControls() {
    canvas.addEventListener('mousedown', (e) => {
        isPanning = true;
        startX = e.clientX - offsetX;
        startY = e.clientY - offsetY;
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        offsetX = e.clientX - startX;
        offsetY = e.clientY - startY;
        drawWorkspace();
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const mouseX = e.clientX - canvas.getBoundingClientRect().left;
        const mouseY = e.clientY - canvas.getBoundingClientRect().top;

        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(wheel * zoomIntensity);

        // Adjust pan offset so that the mouse point stays fixed under zoom
        offsetX = mouseX - (mouseX - offsetX) * zoomFactor;
        offsetY = mouseY - (mouseY - offsetY) * zoomFactor;
        scale *= zoomFactor;

        drawWorkspace();
    }, { passive: false });
}

// Gemini AI Cross-Reference execution
function changeCanvasTheme() {
    canvasTheme = document.getElementById('canvas-theme-select').value;
    drawWorkspace();
}

function handlePdfUpload(event) {
    const file = event.target.files[0];
    const statusLabel = document.getElementById('pdf-upload-status');
    if (!file) {
        pdfBase64 = null;
        statusLabel.textContent = 'No PDF blueprint loaded';
        return;
    }
    statusLabel.textContent = `Loading ${file.name}...`;
    statusLabel.style.color = 'var(--text-secondary)';
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Data = e.target.result.split(',')[1];
        pdfBase64 = base64Data;
        statusLabel.textContent = `PDF Loaded: ${file.name}`;
        statusLabel.style.color = 'var(--success)';
    };
    reader.readAsDataURL(file);
}

// Gemini AI Cross-Reference execution
async function runAICrossReference() {
    const responseBox = document.getElementById('ai-response-container');
    const blueprintText = document.getElementById('blueprint-text').value.trim();

    if (!apiKey) {
        alert("Please input your Gemini API Key in the settings panel first.");
        return;
    }

    if (!gcodeData) {
        alert("Please load a G-code program first.");
        return;
    }
    responseBox.style.display = 'block';
    responseBox.innerHTML = '<span style="color: var(--accent-primary);">Analyzing drawing and G-code alignment... Please wait.</span>';

    // Format the tools, matched list, and warnings to send to the LLM
    const parsedToolsSummary = Object.keys(gcodeData.tools).map(t => `${t}: ${gcodeData.tools[t]}`).join('\n');
    const matchedCoordsText = gcodeData.points.map(p => `Line ${p.lineNum} (${p.fileName}): Tool: ${p.tool} (${p.toolDesc}), G-code: ${p.gcode}, X: ${p.x.toFixed(4)}, Y: ${p.y.toFixed(4)}, Feed: ${p.feed}, Spindle: ${p.spindle}, Is Tapping: ${p.isTap}`).join('\n');

    const prompt = `
You are a senior CNC manufacturing quality engineer verifying a programmer's G-code coordinates and tools against a customer blueprint drawing (PDF or text notes).

CRITICAL CONTEXT:
1. Programmers frequently split operations into multiple separate NC programs (e.g., one program drills the holes, another taps them, or operations are separated due to machine memory / static tool setups).
2. Do NOT assume that a single NC file must contain every drawing feature. 
3. Identify which specific blueprint feature (e.g., M24 tap pattern, M20 tap pattern, M12 tap pattern, or 5/8 Ream pattern) the uploaded G-code program is targeting. You should match based on the G-code tool descriptions (like "Drill for M24 Taps" or "M24 x 3 Tap"), the hole diameters, and coordinates/counts.
4. Once you identify the matching blueprint feature:
   - Check if the tool diameter and types are correct for that *specific* matched feature (e.g., 0.846" drill for M24 thread is correct, but would be wrong for M12).
   - Check if the coordinate locations and pattern count match the matched feature.
   - Check if the speeds/feeds are correct for that matched feature in the given material.
5. If there are other drawing features (like M12, M20, chamfers, etc.) that are NOT present in the current G-code, list them as "Other Blueprint Features (Not Programmed in these file(s))" as a checklist for the user, rather than calling them "errors" or "discrepancies".

BLUEPRINT / DRAWING INPUTS:
${blueprintText}

PARSED G-CODE METADATA:
Tools used:
${parsedToolsSummary}

Programmed canned cycles & coordinates:
${matchedCoordsText}

TASK:
Write a verification report. 
1. Determine what feature(s) on the blueprint these G-code coordinate locations and tools are targeting.
2. Confirm if the programmed tools (e.g. T1 drill size) are correct and on-location for *that* specific target feature.
3. Confirm if the tapping parameters (RPM and Feed rate) are correct for the target feature. Explain the calculations clearly.
4. List which drawing features are missing from the G-code programs as a checklist of "Split Operations to verify in other files".
5. Clearly highlight actual errors (e.g. wrong drill size for the matched feature, incorrect feed/speed ratio for the matched thread size, or wrong coordinate math) in RED or bold.
`;

    const parts = [{ text: prompt }];
    if (pdfBase64) {
        parts.push({
            inlineData: {
                mimeType: "application/pdf",
                data: pdfBase64
            }
        });
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: parts
                }]
            })
        });

        const data = await response.json();
        if (data.error) {
            responseBox.innerHTML = `<span style="color: var(--error);">API Error (Code ${data.error.code}): ${data.error.message}</span>`;
            console.error("Gemini API Error:", data.error);
            return;
        }

        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) {
            let resText = data.candidates[0].content.parts[0].text;
            currentAiReportRaw = resText;
            
            // Format some basic markdown highlight color classes
            resText = resText.replace(/\b(DISCREPANCY|ERROR|WARNING|MISMATCH)\b/g, '**<span style="color: var(--error)">$1</span>**');
            resText = resText.replace(/\b(PASS|VERIFIED|CORRECT)\b/g, '**<span style="color: var(--success)">$1</span>**');

            responseBox.innerHTML = resText;
            document.getElementById('btn-export-ai').style.display = 'block';
        } else {
            responseBox.innerHTML = `<span style="color: var(--error);">Error: Invalid response structure from API. Response received: ${JSON.stringify(data)}</span>`;
        }
    } catch (err) {
        responseBox.innerHTML = `<span style="color: var(--error);">Failed to call Gemini API: ${err.message}</span>`;
    }
}

function renderGcodeOnlyReport() {
    // Fit view to G-code points
    fitViewToPoints();
    drawWorkspace();

    const alertList = document.getElementById('alert-list');
    alertList.innerHTML = `
        <div class="alert-item warning" style="border-left-color: var(--warning);">
            <div class="alert-title">G-Code Only Loaded</div>
            <div class="alert-desc">2D CAD geometric alignment check is disabled because no DXF layout is loaded. Use the AI Drawing Cross-Reference section below to verify features against your PDF print.</div>
        </div>
    `;

    const toolsTableBody = document.getElementById('tools-table-body');
    toolsTableBody.innerHTML = '';

    const coordsTableBody = document.getElementById('coords-table-body');
    coordsTableBody.innerHTML = '';

    // Tools summary
    const activeTools = Object.keys(gcodeData.tools);
    if (activeTools.length === 0) {
        toolsTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No tools parsed.</td></tr>`;
    } else {
        activeTools.forEach(t => {
            const desc = gcodeData.tools[t];
            const uses = gcodeData.points.filter(p => p.tool === t);
            const isTap = uses.some(p => p.isTap);

            let cycleInfo = uses.length > 0 ? `${uses[0].gcode} (${uses.length} holes)` : 'Unused';
            let tapCheckSpan = '<span style="color: var(--text-secondary);">N/A</span>';

            if (isTap && uses.length > 0) {
                const gp = uses[0];
                const spindle = gp.spindle;
                const feed = gp.feed;

                if (spindle > 0 && feed > 0) {
                    const calculatedPitch = feed / spindle;
                    const calcTpi = 1 / calculatedPitch;

                    let closestThread = null;
                    let bestDev = Infinity;
                    STANDARD_THREATS.forEach(st => {
                        const dev = Math.abs(st.pitch - calculatedPitch);
                        if (dev < bestDev) {
                            bestDev = dev;
                            closestThread = st;
                        }
                    });

                    if (bestDev < 0.005) {
                        tapCheckSpan = `<span style="color: var(--success); font-weight: 500;">Matches ${closestThread.name} (${closestThread.tpi} TPI)</span>`;
                    } else {
                        tapCheckSpan = `<span style="color: var(--warning); font-weight: 500;">Non-Std Pitch: ${calcTpi.toFixed(1)} TPI</span>`;
                    }
                } else {
                    tapCheckSpan = `<span style="color: var(--error); font-weight: 500;">Missing F/S values</span>`;
                }
            }

            toolsTableBody.innerHTML += `
                <tr>
                    <td><strong>${t}</strong></td>
                    <td>${desc}</td>
                    <td>${cycleInfo}</td>
                    <td>${tapCheckSpan}</td>
                </tr>
            `;
        });
    }

    // Coordinates list
    gcodeData.points.forEach(gp => {
        coordsTableBody.innerHTML += `
            <tr>
                <td>G-Code (${gp.fileName || 'Loaded File'})</td>
                <td>X: ${gp.x.toFixed(4)}</td>
                <td>Y: ${gp.y.toFixed(4)}</td>
                <td>N/A</td>
                <td><span style="color: var(--accent-primary);">Parsed</span></td>
            </tr>
        `;
    });

    const badge = document.getElementById('audit-summary-badge');
    badge.textContent = 'G-Code Only';
    badge.style.background = 'rgba(59, 130, 246, 0.2)';
    badge.style.color = 'var(--accent-primary)';
}

function exportAIReport() {
    if (!currentAiReportRaw) return;
    
    // Get primary file name if available
    let fileName = 'NC_Verifier_Report';
    if (gcodeData && gcodeData.points && gcodeData.points.length > 0) {
        const firstPointFile = gcodeData.points[0].fileName;
        if (firstPointFile && firstPointFile !== 'Unknown') {
            fileName = firstPointFile.substring(0, firstPointFile.lastIndexOf('.')) + '_Report';
        }
    }
    
    const blob = new Blob([currentAiReportRaw], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${fileName}.md`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
