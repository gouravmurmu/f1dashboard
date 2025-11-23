# Docker Deployment

This guide explains how to deploy the F1 Analytics Dashboard using Docker.

## Prerequisites

- Docker installed on your machine.
- Docker Compose (optional, but recommended).

## Building and Running with Docker

1.  **Build the Docker image:**

    ```bash
    docker build -t f1-dashboard .
    ```

2.  **Run the container:**

    ```bash
    docker run -p 8501:8501 f1-dashboard
    ```

    Access the app at `http://localhost:8501`.

## Using Docker Compose

1.  **Start the service:**

    ```bash
    docker-compose up --build
    ```

    This will build the image and start the container. The app will be available at `http://localhost:8501`.

2.  **Stop the service:**

    ```bash
    docker-compose down
    ```

## Notes

- The `docker-compose.yml` mounts the current directory to `/app` in the container. This allows for live reloading if you edit files locally (Streamlit supports auto-reloading).
- The `backend/cache` directory will be created inside the container. If you want persistence, you can add a volume for it in `docker-compose.yml`.
