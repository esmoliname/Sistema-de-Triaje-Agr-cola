from fastapi import FastAPI

app = FastAPI(title="Sistema de Triaje Agrícola - Hydrogen API")


@app.get("/")
def read_root():
    return {"status": "Agri-Triage Backend Activo"}
