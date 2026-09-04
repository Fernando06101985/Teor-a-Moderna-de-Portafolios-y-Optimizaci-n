import re

with open('src/components/Dashboard.tsx', 'r') as f:
    content = f.read()

# We want to replace the block starting at `            {mptTab === 'pesos' && (` and ending with `            )}` just before `            {mptTab === 'simulador' && (`

start_str = "            {mptTab === 'pesos' && ("
end_str = "            {mptTab === 'simulador' && ("

start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx == -1 or end_idx == -1:
    print("Could not find blocks")
    exit(1)

new_block = """            {mptTab === 'pesos' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    {[
                        { title: "Máximo Sharpe", icon: "★", weights: mptResults.maxSharpePort.weights, border: "border-emerald-200", iconCol: "text-emerald-500" },
                        { title: "Mínima Varianza (GMV)", icon: "●", weights: mptResults.minVariancePort.weights, border: "border-blue-200", iconCol: "text-blue-500" },
                        { title: "Paridad Riesgo (ERC)", icon: "⚖", weights: ercWeightsObj, border: "border-amber-200", iconCol: "text-amber-500" },
                        { title: "Equiponderado (1/N)", icon: "⊜", weights: eqWeightsObj, border: "border-slate-300", iconCol: "text-slate-500" }
                    ].map((chart, idx) => (
                        <Card key={idx} className={`p-6 border ${chart.border} flex flex-col`}>
                            <h3 className="font-bold mb-6 flex items-center gap-2"><span className={chart.iconCol}>{chart.icon}</span> {chart.title}</h3>
                            <div className="flex-1 min-h-[220px] relative">
                                <Doughnut 
                                    data={{
                                        labels: analysisAssets,
                                        datasets: [{
                                            data: analysisAssets.map(a => chart.weights[a] * 100),
                                            backgroundColor: CHART_COLORS.slice(0, analysisAssets.length),
                                            borderWidth: 2,
                                            borderColor: '#ffffff',
                                            hoverOffset: 4
                                        }]
                                    }} 
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: { position: 'right', labels: { font: { size: 11, family: 'monospace' }, boxWidth: 12, padding: 15 } },
                                            tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#f8fafc', bodyColor: '#f8fafc', padding: 12, cornerRadius: 8, callbacks: { label: (ctx: any) => ` ${ctx.label}: ${ctx.raw.toFixed(1)}%` } }
                                        },
                                        cutout: '65%'
                                    }} 
                                />
                            </div>
                        </Card>
                    ))}
                </div>
            )}

"""

# Let's replace the whole block until `            {mptTab === 'simulador' && (`
# Wait, between `            {mptTab === 'pesos' && (` block end and `            {mptTab === 'simulador' && (` there might be empty lines.
# We'll just slice from `start_idx` to `end_idx` and replace it with `new_block`

content = content[:start_idx] + new_block + content[end_idx:]

with open('src/components/Dashboard.tsx', 'w') as f:
    f.write(content)
print("Donuts applied successfully")
