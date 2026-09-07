import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("file") as Blob;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Create new FormData and explicitly set file name
    const apiFormData = new FormData();
    apiFormData.append("file", audioFile, "audio.mp3");

    const backendUrl = process.env.BACKEND_URL || "http://localhost:8004";
    const response = await fetch(
      `${backendUrl}/api/v1/transcribe`,
      {
        method: "POST",
        body: apiFormData,
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // Match the response format your frontend expects
    if (data?.transcription) {
      return NextResponse.json({ transcription: data.transcription });
    } else {
      throw new Error("No transcription in response");
    }
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}
