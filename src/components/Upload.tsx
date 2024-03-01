"use client";

import axiosInstance from "@/axios"; // Assuming this is correctly configured
import { ChangeEvent, useState } from "react";

const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB; adjust as needed

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      // Reset progress state when a new file is selected
      setUploadProgress([]);
    }
  };

  const uploadChunk = async (
    chunk: Blob,
    chunkId: number,
    totalChunks: number
  ) => {
    const formData = new FormData();
    formData.append("chunk", chunk);
    formData.append("chunkId", chunkId.toString());

    return axiosInstance.post("/upload/chunk", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          setUploadProgress((prevProgress) => {
            const newProgress = [...prevProgress];
            newProgress[chunkId] = progress / totalChunks;
            return newProgress;
          });
        }
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const chunks = [];
    for (let start = 0; start < file.size; start += CHUNK_SIZE) {
      const chunk = file.slice(start, start + CHUNK_SIZE);
      chunks.push(chunk);
    }

    setUploadProgress(Array(chunks.length).fill(0)); // Initialize progress for each chunk

    await Promise.all(
      chunks.map((chunk, index) => uploadChunk(chunk, index, chunks.length))
    );

    alert("Video uploaded successfully!");
  };

  // Calculate total progress based on the progress of all chunks
  const totalProgress = uploadProgress.reduce((acc, cur) => acc + cur, 0);

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input type="file" onChange={handleFileChange} />
        <button type="submit">Upload</button>
      </form>
      {uploadProgress.length > 0 && (
        <>
          <progress value={totalProgress} max="100"></progress>
          <div>Upload Progress: {totalProgress.toFixed(2)}%</div>
        </>
      )}
    </div>
  );
}
