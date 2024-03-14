"use client";

import axiosInstance from "@/axios"; // Assuming this is correctly configured
import { ChangeEvent, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid"; // For generating unique file IDs

const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB; adjust as needed

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);
  const [totalUploadProgress, setTotalUploadProgress] = useState<number>(0); // Added state for total upload progress

  const getStoredProgress = (fileId: string) => {
    const progress = localStorage.getItem(`uploadProgress-${fileId}`);
    return progress ? JSON.parse(progress) : [];
  };

  const getCurrentFileId = () => {
    // Check if file data is stored in localStorage
    const fileData = localStorage.getItem("uploadFileData");

    console.log("fileData", fileData);
    if (fileData) {
      // Parse file data and set it to state
      const parsedFileData = JSON.parse(fileData);
      const shouldContinue = window.confirm(
        `A previous upload of file ${parsedFileData.name} was not completed. You can select the file again and the upload will continue`
      );
      if (shouldContinue) {
        setFile(
          new File([""], parsedFileData.name, {
            type: parsedFileData.type,
            lastModified: parsedFileData.lastModified,
          })
        );
      } else {
        // Clear localStorage
        localStorage.removeItem("uploadFileData");
        localStorage.removeItem("currentUploadFileId");
        localStorage.removeItem(`uploadProgress-${parsedFileData.fileId}`);
      }
    }
  };

  const storeProgress = (fileId: string, chunkId: number) => {
    const currentProgress = getStoredProgress(fileId);

    if (!currentProgress.includes(chunkId)) {
      currentProgress.push(chunkId);
      localStorage.setItem(
        `uploadProgress-${fileId}`,
        JSON.stringify(currentProgress)
      );
    }
  };

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
    const storedProgress = getStoredProgress(fileId);
    if (storedProgress.includes(chunkId)) {
      return Promise.resolve();
    }

    const formData = new FormData();
    formData.append("chunk", chunk);
    formData.append("chunkId", chunkId.toString());
    formData.append("totalChunks", totalChunks.toString()); // Send totalChunks to backend
    formData.append("fileId", fileId); // Send fileId to backend

    return axiosInstance
      .post("/upload/chunk", formData, {
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
      })
      .then(() => storeProgress(fileId, chunkId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const fileData = {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    };
    localStorage.setItem("uploadFileData", JSON.stringify(fileData));
    let fileId: string;

    // Check if we're resuming an upload and if a fileId already exists
    const savedFileId = localStorage.getItem("currentUploadFileId");
    if (savedFileId) {
      fileId = savedFileId;
    } else {
      fileId = uuidv4();
      localStorage.setItem("currentUploadFileId", fileId);
    }
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const chunks = [];
    for (let start = 0; start < file.size; start += CHUNK_SIZE) {
      const chunk = file.slice(start, start + CHUNK_SIZE);
      chunks.push(chunk);
    }

    // Initialize uploadProgress based on what's already uploaded
    const storedProgress = getStoredProgress(fileId); // Function to retrieve stored progress
    setUploadProgress(
      Array(totalChunks)
        .fill(0)
        .map((_, index) => (storedProgress.includes(index) ? 100 : 0))
    );

    await Promise.all(
      chunks.map(
        (chunk, index) => uploadChunk(chunk, index, totalChunks, fileId) // Pass fileId to uploadChunk
      )
    );

    setTimeout(() => {
      const totalProgress =
        uploadProgress.reduce((acc, cur) => acc + cur, 0) / totalChunks;
      setTotalUploadProgress(totalProgress);

      // Clean up after successful upload
      localStorage.removeItem("currentUploadFileId"); // Important: Remove fileId from localStorage
      localStorage.removeItem(`uploadProgress-${fileId}`); // Important: Remove Chunk upload progress from localStorage
      alert("Video uploaded successfully!");
    }, 0);
  };

  useEffect(() => {
    getCurrentFileId();

    return () => {};
  }, []);

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
