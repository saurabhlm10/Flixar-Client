"use client";

import axiosInstance from "@/axios"; // Assuming this is correctly configured
import { AxiosResponse } from "axios";
import { ChangeEvent, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid"; // For generating unique file IDs

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB; adjust as needed

interface UploadProgress {
  clientToServer: number;
  serverToDisk: number;
}

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [totalUploadProgress, setTotalUploadProgress] = useState<number>(0); // Added state for total upload progress

  const getStoredProgress = (fileId: string) => {
    const progress = localStorage.getItem(`uploadProgress-${fileId}`);
    return progress ? JSON.parse(progress) : [];
  };

  const getCurrentFileId = () => {
    // Check if file data is stored in localStorage
    const fileData = localStorage.getItem("uploadFileData");

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
    fileId: string, // Include fileId in the parameters
    uploadId: string // Include uploadId in the parameters
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
    formData.append("uploadId", uploadId); // Send fileId to backend

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

            if (newProgress[chunkId - 1].clientToServer !== 100) {
              newProgress[chunkId - 1].clientToServer = progress;

              // Calculate and set total upload progress
              const totalProgress =
                newProgress.reduce(
                  (acc, cur) => acc + cur.clientToServer / 2,
                  0
                ) / totalChunks;

              console.log("totalProgress", totalProgress);

              setTotalUploadProgress(totalProgress);
            }

            return newProgress;
          });
        }
      },
    });
  };

  // useEffect(() => {
  //   setTotalUploadProgress(() => {
  //     return (
  //       uploadProgress.reduce((total, progress) => {
  //         return total + (progress.clientToServer + progress.serverToDisk) / 2;
  //       }, 0) / uploadProgress.length
  //     );
  //   });

  //   return () => {};
  // }, [uploadProgress]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const etagsCollected: any = []; // Temporary array to collect ETags

    const fileData = {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    };
    localStorage.setItem("uploadFileData", JSON.stringify(fileData));
    let fileId: string;
    let uploadId: string;

    // Check if we're resuming an upload and if a fileId already exists
    const savedFileId = localStorage.getItem("currentUploadFileId");
    const savedUploadId = localStorage.getItem("currentUploadId");
    if (savedFileId && savedUploadId) {
      fileId = savedFileId;
      uploadId = savedUploadId;
    } else {
      fileId = uuidv4();
      const response = await axiosInstance.post("/upload/initiate", { fileId });
      uploadId = response.data.UploadId;
      localStorage.setItem("currentUploadFileId", fileId);
      localStorage.setItem("currentUploadId", uploadId);
    }
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    setUploadProgress(
      new Array(totalChunks).fill({ clientToServer: 0, serverToDisk: 0 })
    );

    const chunks = [];
    for (let start = 0; start < file.size; start += CHUNK_SIZE) {
      let end = start + CHUNK_SIZE;

      // If the remaining part of the file is smaller than CHUNK_SIZE,
      // take the rest of the file as the last chunk.
      if (file.size - end < CHUNK_SIZE) {
        end = file.size;
      }

      const chunk = file.slice(start, end);
      chunks.push(chunk);
    }

    // Initialize uploadProgress based on what's already uploaded
    const storedProgress = getStoredProgress(fileId); // Function to retrieve stored progress

    // setUploadProgress(
    //   Array(totalChunks)
    //     .fill(0)
    //     .map((_, index) => (storedProgress.includes(index) ? 100 : 0))
    // );
    const eventSource = new EventSource(
      `http://localhost:4000/api/progress/${uploadId}`
    );

    eventSource.onmessage = function (event) {
      const data = JSON.parse(event.data);
      console.log("Progress update:", data);

      // Update your progress UI here
      setTotalUploadProgress((prevTotalProgress) => {
        setUploadProgress((prevProgress) => {
          const newProgress = [...prevProgress];

          newProgress[data.chunkId - 1].serverToDisk = 100;

          const totalProgress =
            newProgress.reduce(
              (acc, cur) => acc + cur.serverToDisk / 2,
              prevTotalProgress
            ) / totalChunks;

          console.log("totalProgress in eventSource", totalProgress);

          // setTotalUploadProgress(totalProgress);

          return newProgress;
        });

        return totalUploadProgress;
      });

      // if (progressEvent.total) {
      //     const progress = (progressEvent.loaded / progressEvent.total) * 100;
      //     setUploadProgress((prevProgress) => {
      //       const newProgress = [...prevProgress];

      //       newProgress[chunkId] = progress;

      //       // Calculate and set total upload progress
      //       const totalProgress =
      //         newProgress.reduce((acc, cur) => acc + cur, 0) / totalChunks;

      //       setTotalUploadProgress(totalProgress);

      //       return newProgress;
      //     });
      //   }
      // },
    };
    await Promise.all(
      chunks.map(async (chunk, index) => {
        try {
          const response = (await uploadChunk(
            chunk,
            index + 1,
            totalChunks,
            fileId,
            uploadId
          )) as AxiosResponse;

          storeProgress(fileId, index + 1);

          etagsCollected[index] = {
            ETag: response?.data?.ETag,
            PartNumber: index + 1,
          }; // Collect ETag with part number
        } catch (error) {
          console.error(`Failed to upload chunk ${index + 1}:`, error);
          // Optionally, add logic to handle the upload failure, such as retrying
          return;
        }
      })
    );

    console.log(
      "etagsCollected.length === totalChunks",
      etagsCollected.length === totalChunks
    );
    console.log("etagsCollected", etagsCollected);

    // After all chunk uploads are completed, call the merge API
    try {
      const mergeResponse = await axiosInstance.post("/upload/merge", {
        fileId,
        uploadId,
        etags: etagsCollected.filter((etag: any) => etag !== undefined), // Ensure only defined ETags are sent
      });

      // Cleanup after successful upload
      localStorage.removeItem("currentUploadFileId");
      localStorage.removeItem("currentUploadId");
      localStorage.removeItem(`uploadProgress-${fileId}`);
      localStorage.removeItem("uploadFileData");
      alert("Video uploaded successfully!");

      // Reset states
      setFile(null);
      setTotalUploadProgress(0);
      setUploadProgress([]);
    } catch (error) {
      console.error("Error during file merge:", error);
      alert("Error during file merge.");
    }
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
