import os
from dotenv import load_dotenv

load_dotenv()

import uvicorn

if __name__ == "__main__":
    debug = os.environ.get("ENVIRONMENT", "development") == "development"
    uvicorn.run("main:app", host="0.0.0.0", port=4000, reload=debug)
