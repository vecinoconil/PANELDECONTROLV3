import os
from dotenv import load_dotenv

# Ensure working directory is the backend folder
os.chdir(os.path.dirname(os.path.abspath(__file__)))

load_dotenv()

import uvicorn

if __name__ == "__main__":
    debug = os.environ.get("ENVIRONMENT", "development") == "development"
    uvicorn.run("main:app", host="0.0.0.0", port=4000, reload=False)
