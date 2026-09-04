# Let's test with the unrounded covariance matrix from Excel
# In Excel, cov matrix is calculated from daily return covariance * 252
# Let's see: in 7.0 Datos Historicos, what is the exact cov matrix?
# In image 1, row 39: Varianza del Portafolio table in Excel:
# Notice row 39 in the user's image shows the column totals:
# w * cov:
# AAPL: 0.00%, MSFT: 0.05%, KO: 0.61%, VFH: 0.01%, VHT: 0.50%, EEM: 0.38% -> Sum = 1.55%
# Let's test if we solve min w^T C w with exact QP or with the daily data in the applet
