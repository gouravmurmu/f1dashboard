# Deployment to Hugging Face Spaces

This project is designed to be deployed on [Hugging Face Spaces](https://huggingface.co/spaces) using the Streamlit SDK.

## Steps to Deploy

1. **Create a New Space**
   - Go to Hugging Face Spaces and create a new Space.
   - Select **Streamlit** as the SDK.
   - Choose a name for your space (e.g., `f1-analytics-dashboard`).

2. **Upload Files**
   - You can upload the files via the web interface or use Git.
   - Ensure the following structure is at the root of your Space:
     ```
     app.py
     requirements.txt
     backend/
     components/
     pages/
     models/
     ```

3. **Dependencies**
   - The `requirements.txt` file is automatically detected by Hugging Face to install Python dependencies.
   - If you need system-level packages (like `ffmpeg`), create a `packages.txt` file.

4. **Configuration**
   - FastF1 requires a cache directory. The app is configured to create `backend/cache` if it doesn't exist.
   - Hugging Face Spaces provides ephemeral storage. For persistent caching, consider using a persistent storage dataset or external cache, but for this demo, the default ephemeral cache is fine.

## Local Development

To run the app locally:

```bash
pip install -r requirements.txt
streamlit run app.py
```
