import pandas as pd

# Cargar el conjunto de datos
try:
    df = pd.read_csv('public/SINIESTROS.csv')
except FileNotFoundError:
    print("El archivo 'public/SINIESTROS.csv' no fue encontrado.")
    exit()

# Convertir la columna 'HORA' a formato de hora
df['HORA'] = pd.to_datetime(df['HORA'], format='%H:%M:%S', errors='coerce').dt.hour

# Eliminar filas con valores de hora no válidos
df = df.dropna(subset=['HORA'])

# Definir el mapeo de causas
cause_mapping = {
    'D': 'Distracción',
    'NSD': 'No se puede Determinar',
    'A': 'Alcohol',
    'PI': 'Peatón Imprudente',
    'G': 'Giro',
    'VS': 'Violacion Semáforo',
    'PC': 'Perdida de Control',
    'NR': 'No Respeto Prioridad de Paso',
    'MR': 'Maniobra Riesgosa',
    'PERSECUCIÓN': 'Persecución',
    'P': 'Perro',
    'IC': 'Invasión de Carril',
    'FV': 'Falla en la Vía',
    'EV': 'Exceso de Velocidad'
}

# Decodificar las causas
df['CAUSA_DECODIFICADA'] = df['CODIGOS CAUSAS'].map(cause_mapping).fillna(df['CODIGOS CAUSAS'])

# Análisis de siniestralidad por hora
hourly_accidents = df['HORA'].value_counts().sort_index()

# Definir franjas horarias
bins = [0, 6, 12, 18, 24]
labels = ['Madrugada (0-6)', 'Mañana (7-12)', 'Tarde (13-18)', 'Noche (19-24)']
df['FRANJA_HORARIA'] = pd.cut(df['HORA'], bins=bins, labels=labels, right=False)

# Análisis de siniestralidad por franja horaria
time_slot_accidents = df['FRANJA_HORARIA'].value_counts()

# Análisis de causas de siniestros por franja horaria
cause_by_time_slot = df.groupby('FRANJA_HORARIA')['CAUSA_DECODIFICADA'].value_counts().unstack(fill_value=0)

print("Análisis de Siniestralidad por Hora:")
print(hourly_accidents)

print("\nAnálisis de Siniestralidad por Franja Horaria:")
print(time_slot_accidents)

print("\nAnálisis Detallado de Causas de Siniestros por Franja Horaria:")
print(cause_by_time_slot)