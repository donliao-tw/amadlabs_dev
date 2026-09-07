from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .analyzer import MAX_FILE_SIZE_BYTES, UnsafeWorkbookError, analyze_workbook
from .models import WorkbookOverview

app = FastAPI(title="Industrial Excel AI — Backend", version="0.1.0")

# Same-origin in production (host Nginx proxies /api/iea/ on amadlabs.com),
# CORS is only needed for local frontend development against this service.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "iea-backend"}


@app.post("/analyze", response_model=WorkbookOverview)
async def analyze(file: UploadFile = File(...)):
    content = await file.read(MAX_FILE_SIZE_BYTES + 1)
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the size limit.")

    try:
        return analyze_workbook(file.filename or "", content)
    except UnsafeWorkbookError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
