// "use client";

// import React, { useState, useEffect, ChangeEvent } from "react";
// import { Mic, Link, FileText, Upload, Plus, X } from "lucide-react";
// import { GrFormNext } from "react-icons/gr";
// import axios, { AxiosError } from "axios";
// import { showSuccessToast } from "@/utils/toast";

// type Option = {
//   id: "url" | "files" | "query" | "audio";
//   label: string;
//   icon: JSX.Element;
// };

// const roles = [
//   "Assistant",
//   "Salesperson",
//   "Marketer",
//   "Developer",
//   "Filmmaker",
//   "Creatives",
//   "Designer",
//   "Main Character Energy",
//   "Support",
// ];

// const tones = [
//   "Professional",
//   "Friendly",
//   "Casual",
//   "Formal",
//   "Informal",
//   "Gen Z",
//   "Millennial",
//   "Boomer",
//   "Gen X",
//   "Child",
//   "Teen",
//   "Adult",
//   "Elderly",
//   "It-girl",
// ];

// const languages = ["English", "Nepali", "Sanskrit", "Roman Nepali", "Hindi"];

// const Main = ({ onClose }: { onClose: () => void }) => {
//   const [nextPressed, setNextPressed] = useState<boolean>(false);
//   const [name, setName] = useState<string>("");
//   const [selectedOption, setSelectedOption] = useState<
//     "url" | "files" | "query" | "audio"
//   >("url");
//   const [urls, setUrls] = useState<string[]>([""]);
//   const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
//   const [isLoading, setIsLoading] = useState<boolean>(false);
//   const [error, setError] = useState<string>("");
//   const [userId, setUserId] = useState<string>("");

//   useEffect(() => {
//     if (typeof window !== "undefined") {
//       const user = localStorage.getItem("user");
//       const parsedUserId = user ? JSON.parse(user)._id : "";
//       setUserId(parsedUserId);
//     }
//   }, []);

//   const options: Option[] = [
//     { id: "url", label: "URLs", icon: <Link className="w-5 h-5" /> },
//     { id: "files", label: "Files", icon: <FileText className="w-5 h-5" /> },
//   ];

//   const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
//     const files = e.target.files;
//     if (files) {
//       setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
//     }
//   };

//   const handleUrlChange = (index: number, value: string): void => {
//     const newUrls = [...urls];
//     newUrls[index] = value;
//     setUrls(newUrls);
//   };

//   const addUrlField = (): void => {
//     setUrls([...urls, ""]);
//   };

//   const removeUrl = (index: number): void => {
//     const newUrls = urls.filter((_, i) => i !== index);
//     setUrls(newUrls.length ? newUrls : [""]);
//   };

//   const removeFile = (index: number): void => {
//     setSelectedFiles((files) => files.filter((_, i) => i !== index));
//   };

//   const handleSubmit = async (): Promise<void> => {
//     if (!userId) {
//       setError("User ID is required. Please log in again.");
//       return;
//     }

//     if (!name.trim()) {
//       setError("Agent name is required");
//       return;
//     }

//     const formData = new FormData();
//     formData.append("user_id", userId);
//     formData.append("agent_name", name);
//     formData.append("role", selectedValues.role);
//     formData.append("tone", selectedValues.tone);
//     formData.append("language", selectedValues.language);

//     switch (selectedOption) {
//       case "url":
//         const validUrls = urls.filter((url) => url.trim());
//         if (!validUrls.length) {
//           setError("Please enter at least one valid URL");
//           return;
//         }
//         formData.append("urls", JSON.stringify(validUrls));
//         break;

//       case "files":
//         if (!selectedFiles.length) {
//           setError("Please select at least one file");
//           return;
//         }
//         selectedFiles.forEach((file) => {
//           formData.append("documents", file);
//         });
//         break;
//     }

//     setIsLoading(true);
//     setError("");

//     try {
//       const response = await axios.post("/api/v1/agents/create", formData, {
//         headers: {
//           "Content-Type": "multipart/form-data",
//           // Add any additional headers if needed for handling arrays
//         },
//       });

//       if (response.data) {
//         console.log("Agent has been created");
//         showSuccessToast("Agent has been created");
//         setNextPressed(false);
//         setName("");
//         setUrls([""]);
//         setSelectedFiles([]);
//         onClose();
//       }
//     } catch (err) {
//       if (err instanceof AxiosError) {
//         setError(err.response?.data?.message);
//       } else {
//         setError("An error occurred");
//       }
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const [selectedValues, setSelectedValues] = useState({
//     role: "Assistant",
//     tone: "Professional",
//     language: "English",
//   });

//   const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
//     const { name, value } = e.target;
//     setSelectedValues((prev) => ({
//       ...prev,
//       [name]: value,
//     }));
//   };

//   const getInputSection = (): JSX.Element | null => {
//     switch (selectedOption) {
//       case "url":
//         return (
//           <div className="space-y-3">
//             {urls.map((url, index) => (
//               <div key={index} className="flex gap-2">
//                 <input
//                   type="url"
//                   value={url}
//                   onChange={(e) => handleUrlChange(index, e.target.value)}
//                   placeholder="Enter website URL"
//                   className="flex-1 p-3 border border-gray-200 rounded-lg dark:bg-navy-900 dark:border-gray-600 dark:text-white"
//                 />
//                 {urls.length > 1 && (
//                   <button
//                     onClick={() => removeUrl(index)}
//                     className="p-3 text-gray-500 hover:text-red-500"
//                   >
//                     <X className="w-5 h-5" />
//                   </button>
//                 )}
//               </div>
//             ))}
//             <button
//               onClick={addUrlField}
//               className="flex items-center gap-2 text-orange-500 hover:text-orange-600"
//             >
//               <Plus className="w-4 h-4" />
//               Add another URL
//             </button>
//           </div>
//         );

//       case "files":
//         return (
//           <div className="space-y-4">
//             <div className="relative">
//               <p className="mb-2 text-gray-600 dark:text-gray-400">
//                 Upload your documents, FAQs, or datasets to train your Agent.
//               </p>
//               <div className="relative">
//                 <input
//                   type="file"
//                   onChange={handleFileChange}
//                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
//                   accept=".pdf,.doc,.docx,.txt"
//                   multiple
//                 />
//                 <button className="w-full p-3 border border-gray-200 rounded-lg text-left text-gray-500 dark:border-gray-600 dark:text-gray-400 flex items-center gap-2">
//                   <Upload className="w-4 h-4 text-orange-500" />
//                   <span>Upload Files</span>
//                   <span className="text-sm text-gray-400 ml-2">
//                     PDF, DOCX file
//                   </span>
//                 </button>
//               </div>
//             </div>
//             {selectedFiles.length > 0 && (
//               <div className="space-y-2">
//                 <p className="font-medium dark:text-white">Selected Files:</p>
//                 {selectedFiles.map((file, index) => (
//                   <div
//                     key={index}
//                     className="flex items-center justify-between p-2 border border-gray-200 rounded dark:border-gray-600"
//                   >
//                     <span className="text-sm text-gray-600 dark:text-gray-400">
//                       {file.name}
//                     </span>
//                     <button
//                       onClick={() => removeFile(index)}
//                       className="text-gray-500 hover:text-red-500"
//                     >
//                       <X className="w-4 h-4" />
//                     </button>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>
//         );

//       default:
//         return null;
//     }
//   };

//   return (
//     <div>
//       {error && (
//         <p className="text-white bg-red-400 p-[20px] font-bold rounded-lg mb-4">
//           {error}
//         </p>
//       )}
//       {!nextPressed ? (
//         <div className="flex flex-col gap-[10px]">
//           <div className="font-medium dark:text-white">Train Your AI</div>
//           <div className="text-gray-400">
//             Customize your AI agent to fit your unique needs.
//           </div>
//           <div className="flex w-full mb-6 border border-gray-300 dark:border-gray-600 rounded-lg">
//             <input
//               type="text"
//               aria-label="Enter your name"
//               placeholder="Your Agent Name"
//               value={name}
//               onChange={(e) => setName(e.target.value)}
//               onKeyDown={(e) => e.key === "Enter" && setNextPressed(true)}
//               className="rounded-l-lg p-3 flex-grow focus:ring-0 dark:bg-navy-900 dark:text-white"
//             />
//             <button
//               onClick={() => setNextPressed(true)}
//               className="rounded-r-lg p-3 flex items-center justify-center transition-colors"
//             >
//               <GrFormNext />
//             </button>
//           </div>
//         </div>
//       ) : (
//         <div className="space-y-6 md:min-w-[500px]">
//           <div>
//             <h2 className="text-xl font-semibold dark:text-white">
//               Add training data
//             </h2>
//             <p className="text-gray-600 dark:text-gray-400 text-sm">
//               Provide the knowledge your Agent needs.
//             </p>
//           </div>

//           <div className="mb-6">
//             <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
//               Agent Characteristics
//             </h3>
//             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//               <div>
//                 <label
//                   htmlFor="role"
//                   className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
//                 >
//                   Role
//                 </label>
//                 <select
//                   id="role"
//                   name="role"
//                   value={selectedValues.role}
//                   onChange={handleChange}
//                   className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
//                 >
//                   {roles.map((role) => (
//                     <option key={role.toLowerCase()} value={role}>
//                       {role}
//                     </option>
//                   ))}
//                 </select>
//               </div>

//               <div>
//                 <label
//                   htmlFor="tone"
//                   className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
//                 >
//                   Tone
//                 </label>
//                 <select
//                   id="tone"
//                   name="tone"
//                   value={selectedValues.tone}
//                   onChange={handleChange}
//                   className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
//                 >
//                   {tones.map((tone) => (
//                     <option key={tone.toLowerCase()} value={tone}>
//                       {tone}
//                     </option>
//                   ))}
//                 </select>
//               </div>

//               <div>
//                 <label
//                   htmlFor="language"
//                   className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
//                 >
//                   Language
//                 </label>
//                 <select
//                   id="language"
//                   name="language"
//                   value={selectedValues.language}
//                   onChange={handleChange}
//                   className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
//                 >
//                   {languages.map((language) => (
//                     <option key={language.toLowerCase()} value={language}>
//                       {language}
//                     </option>
//                   ))}
//                 </select>
//               </div>
//             </div>
//           </div>
//           <div>
//             <p className="mb-3 text-gray-700 dark:text-gray-300">
//               Choose one of the following
//             </p>
//             <div className="grid grid-cols-2 gap-4">
//               {options.map((option) => (
//                 <button
//                   key={option.id}
//                   onClick={() => {
//                     setSelectedOption(option.id);
//                     setUrls([""]);
//                     setSelectedFiles([]);
//                   }}
//                   className={`p-4 rounded-lg border flex flex-col items-center justify-center gap-2 ${
//                     selectedOption === option.id
//                       ? "border-orange-500 text-orange-500"
//                       : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400"
//                   }`}
//                 >
//                   {option.icon}
//                   <span className="text-sm">{option.label}</span>
//                 </button>
//               ))}
//             </div>
//           </div>
//           {getInputSection()}
//           <button
//             onClick={handleSubmit}
//             disabled={isLoading}
//             className="w-full p-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
//           >
//             {isLoading ? "Training..." : "Train Your AI"}
//           </button>
//         </div>
//       )}
//     </div>
//   );
// };

// export default Main;

'use client'

import React, { useState, useEffect, ChangeEvent } from "react";
import { Mic, Link, FileText, Upload, Plus, X } from "lucide-react";
import { GrFormNext } from "react-icons/gr";
import axios, { AxiosError } from "axios";
import { showSuccessToast } from "@/utils/toast";

const roles = [
  "Assistant",
  "Salesperson",
  "Marketer",
  "Developer",
  "Filmmaker",
  "Creatives",
  "Designer",
  "Main Character Energy",
  "Support",
];

const tones = [
  "Professional",
  "Friendly",
  "Casual",
  "Formal",
  "Informal",
  "Gen Z",
  "Millennial",
  "Boomer",
  "Gen X",
  "Child",
  "Teen",
  "Adult",
  "Elderly",
  "It-girl",
];

const languages = ["English", "Nepali", "Sanskrit", "Roman Nepali", "Hindi"];

const Main = ({ onClose }: { onClose: () => void }) => {
  const [nextPressed, setNextPressed] = useState<boolean>(false);
  const [name, setName] = useState<string>("");
  const [urls, setUrls] = useState<string[]>([""]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [userId, setUserId] = useState<string>("");

  const [selectedValues, setSelectedValues] = useState({
    role: "Assistant",
    tone: "Professional",
    language: "English",
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const user = localStorage.getItem("user");
      const parsedUserId = user ? JSON.parse(user)._id : "";
      setUserId(parsedUserId);
    }
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const files = e.target.files;
    if (files) {
      setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
    }
  };

  const handleUrlChange = (index: number, value: string): void => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const addUrlField = (): void => {
    setUrls([...urls, ""]);
  };

  const removeUrl = (index: number): void => {
    const newUrls = urls.filter((_, i) => i !== index);
    setUrls(newUrls.length ? newUrls : [""]);
  };

  const removeFile = (index: number): void => {
    setSelectedFiles((files) => files.filter((_, i) => i !== index));
  };

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSelectedValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (): Promise<void> => {
    if (!userId) {
      setError("User ID is required. Please log in again.");
      return;
    }

    if (!name.trim()) {
      setError("Agent name is required");
      return;
    }

    // Check if at least one URL or file is provided
    const validUrls = urls.filter((url) => url.trim());
    if (!validUrls.length && !selectedFiles.length) {
      setError("Please provide at least one URL or upload a file");
      return;
    }

    const formData = new FormData();
    formData.append("user_id", userId);
    formData.append("agent_name", name);
    formData.append("role", selectedValues.role.toLowerCase());
    formData.append("tone", selectedValues.tone.toLowerCase());
    formData.append("language", selectedValues.language.toLowerCase());

    if (validUrls.length) {
      formData.append("urls", JSON.stringify(validUrls));
    }

    selectedFiles.forEach((file) => {
      formData.append("documents", file);
    });

    setIsLoading(true);
    setError("");

    try {
      const response = await axios.post("/api/v1/agents/create", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.data) {
        showSuccessToast("Agent has been created");
        setNextPressed(false);
        setName("");
        setUrls([""]);
        setSelectedFiles([]);
        onClose();
      }
    } catch (err) {
      if (err instanceof AxiosError) {
        setError(err.response?.data?.message);
      } else {
        setError("An error occurred");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <p className="text-white bg-red-400 p-[20px] font-bold rounded-lg mb-4">
          {error}
        </p>
      )}
      {!nextPressed ? (
        <div className="flex flex-col gap-[10px]">
          <div className="font-medium dark:text-white">Train Your AI</div>
          <div className="text-gray-400">
            Customize your AI agent to fit your unique needs.
          </div>
          <div className="flex w-full mb-6 border border-gray-300 dark:border-gray-600 rounded-lg">
            <input
              type="text"
              aria-label="Enter your name"
              placeholder="Your Agent Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setNextPressed(true)}
              className="rounded-l-lg p-3 flex-grow focus:ring-0 dark:bg-navy-900 dark:text-white"
            />
            <button
              onClick={() => setNextPressed(true)}
              className="rounded-r-lg p-3 flex items-center justify-center transition-colors"
            >
              <GrFormNext />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6 md:min-w-[500px]">
          <div>
            <h2 className="text-xl font-semibold dark:text-white">
              Add training data
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Provide URLs and/or upload documents to train your Agent.
            </p>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Agent Characteristics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="role"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Role
                </label>
                <select
                  id="role"
                  name="role"
                  value={selectedValues.role}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                >
                  {roles.map((role) => (
                    <option key={role.toLowerCase()} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="tone"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Tone
                </label>
                <select
                  id="tone"
                  name="tone"
                  value={selectedValues.tone}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                >
                  {tones.map((tone) => (
                    <option key={tone.toLowerCase()} value={tone}>
                      {tone}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="language"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Language
                </label>
                <select
                  id="language"
                  name="language"
                  value={selectedValues.language}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                >
                  {languages.map((language) => (
                    <option key={language.toLowerCase()} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* URLs Section */}
            <div className="space-y-3">
              <h4 className="font-medium dark:text-white">Website URLs</h4>
              {urls.map((url, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => handleUrlChange(index, e.target.value)}
                    placeholder="Enter website URL"
                    className="flex-1 p-3 border border-gray-200 rounded-lg dark:bg-navy-900 dark:border-gray-600 dark:text-white"
                  />
                  {urls.length > 1 && (
                    <button
                      onClick={() => removeUrl(index)}
                      className="p-3 text-gray-500 hover:text-red-500"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addUrlField}
                className="flex items-center gap-2 text-orange-500 hover:text-orange-600"
              >
                <Plus className="w-4 h-4" />
                Add another URL
              </button>
            </div>

            {/* Files Section */}
            <div className="space-y-4">
              <h4 className="font-medium dark:text-white">Upload Documents</h4>
              <div className="relative">
                <p className="mb-2 text-gray-600 dark:text-gray-400">
                  Upload your documents, FAQs, or datasets to train your Agent.
                </p>
                <div className="relative">
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    accept=".pdf,.doc,.docx,.txt"
                    multiple
                  />
                  <button className="w-full p-3 border border-gray-200 rounded-lg text-left text-gray-500 dark:border-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-orange-500" />
                    <span>Upload Files</span>
                    <span className="text-sm text-gray-400 ml-2">
                      PDF, DOCX file
                    </span>
                  </button>
                </div>
              </div>
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium dark:text-white">Selected Files:</p>
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 border border-gray-200 rounded dark:border-gray-600"
                    >
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {file.name}
                      </span>
                      <button
                        onClick={() => removeFile(index)}
                        className="text-gray-500 hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full p-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isLoading ? "Training..." : "Train Your AI"}
          </button>
        </div>
      )}
    </div>
  );
};

export default Main;