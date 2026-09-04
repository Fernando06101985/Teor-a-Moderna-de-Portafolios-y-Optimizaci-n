import re

with open('src/components/Dashboard.tsx', 'r') as f:
    content = f.read()

# Replace labels array
old_labels = "labels: analysisAssets,"
new_labels = "labels: analysisAssets.map(a => `${a}: ${(chart.weights[a] * 100).toFixed(1)}%`),"

content = content.replace(old_labels, new_labels)

# Replace tooltip callback to avoid duplicate percentages
old_tooltip = "callbacks: { label: (ctx: any) => ` ${ctx.label}: ${ctx.raw.toFixed(1)}%` }"
new_tooltip = "callbacks: { label: (ctx: any) => ` ${ctx.label}` }"

content = content.replace(old_tooltip, new_tooltip)

with open('src/components/Dashboard.tsx', 'w') as f:
    f.write(content)
print("Labels patched")
