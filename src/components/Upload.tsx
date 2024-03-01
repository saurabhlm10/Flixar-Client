"use client";

import axiosInstance from "@/axios"; // Assuming this is correctly configured
import { ChangeEvent, useState } from "react";
import { v4 as uuidv4 } from "uuid"; // For generating unique file IDs

const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB; adjust as needed

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);
  const [totalUploadProgress, setTotalUploadProgress] = useState<number>(0); // Added state for total upload progress

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      // Reset progress state when a new file is selected
      setUploadProgress([]);
      setTotalUploadProgress(0); // Reset total upload progress
    }
  };

  const uploadChunk = async (
    chunk: Blob,
    chunkId: number,
    totalChunks: number,
    fileId: string // Include fileId in the parameters
  ) => {
    const formData = new FormData();
    formData.append("chunk", chunk);
    formData.append("chunkId", chunkId.toString());
    formData.append("totalChunks", totalChunks.toString()); // Send totalChunks to backend
    formData.append("fileId", fileId); // Send fileId to backend

    return axiosInstance.post("/upload/chunk", formData, {
      // Ensure endpoint matches backend
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          setUploadProgress((prevProgress) => {
            const newProgress = [...prevProgress];
            newProgress[chunkId] = progress;

            // Calculate and set total upload progress
            const totalProgress =
              newProgress.reduce((acc, cur) => acc + cur, 0) / totalChunks;
            setTotalUploadProgress(totalProgress);

            return newProgress;
          });
        }
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const fileId = uuidv4(); // Generate a unique fileId for this upload
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const chunks = [];
    for (let start = 0; start < file.size; start += CHUNK_SIZE) {
      const chunk = file.slice(start, start + CHUNK_SIZE);
      chunks.push(chunk);
    }

    setUploadProgress(Array(chunks.length).fill(0)); // Initialize progress for each chunk

    await Promise.all(
      chunks.map(
        (chunk, index) => uploadChunk(chunk, index, totalChunks, fileId) // Pass fileId to uploadChunk
      )
    );

    // Calculate and set total upload progress after all chunks are uploaded
    const totalProgress =
      uploadProgress.reduce((acc, cur) => acc + cur, 0) / totalChunks;
    console.log(totalUploadProgress);
    setTotalUploadProgress(totalProgress);

    alert("Video uploaded successfully!");
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input type="file" onChange={handleFileChange} />
        <button type="submit">Upload</button>
      </form>
      {totalUploadProgress > 0 && (
        <>
          <progress value={totalUploadProgress} max="100"></progress>
          <div>Upload Progress: {totalUploadProgress.toFixed(2)}%</div>
        </>
      )}
    </div>
  );
}
