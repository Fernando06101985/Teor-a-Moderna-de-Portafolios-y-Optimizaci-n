import re
with open('src/components/Dashboard.tsx', 'r') as f:
    content = f.read()

content = content.replace("Title, Tooltip, Legend, Filler", "Title, Tooltip, Legend, Filler, ArcElement")
content = content.replace("import { Line, Scatter } from 'react-chartjs-2';", "import { Line, Scatter, Doughnut } from 'react-chartjs-2';")

with open('src/components/Dashboard.tsx', 'w') as f:
    f.write(content)
