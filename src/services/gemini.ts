import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AnalysisResult {
  isSuspectMatch: boolean;
  suspectId?: string;
  confidence: number;
  behavior: string;
  isSuspicious: boolean;
  detectedObjects: string[];
  faces: { x: number; y: number; w: number; h: number; isSuspect: boolean }[];
}

export async function analyzeFrame(base64Image: string, suspects: any[]): Promise<AnalysisResult> {
  const model = "gemini-3-flash-preview";
  
  let imagePartIndex = 2;
  const suspectContext = suspects.map((s) => {
    let ctx = `ID: ${s.id}, Name: ${s.name}, Category: ${s.category}, Description: ${s.description}, Risk: ${s.risk_level}`;
    if (s.image_data) {
      ctx += ` (Reference Image provided as Image Part ${imagePartIndex++})`;
    }
    return ctx;
  }).join("\n");

  const prompt = `
    Analyze this surveillance camera frame (Image Part 1) with extreme precision and strict adherence to the suspect database.
    
    Current Suspect Database (Profiles to match against):
    ${suspectContext}

    CRITICAL INSTRUCTIONS:
    1. Identify all faces in Image Part 1 (the live frame).
    2. For EACH face in Image Part 1, compare it meticulously against the suspect database descriptions AND their reference images (if provided in subsequent Image Parts).
    3. ONLY set isSuspectMatch to true if there is a HIGH-CONFIDENCE visual match (above 85% similarity) between a detected face in Image Part 1 and a suspect in the database.
    4. If there are NO faces in Image Part 1, or if none of the faces match a suspect, isSuspectMatch MUST be false and suspectId MUST be null.
    5. DO NOT hallucinate matches. If you are unsure, mark isSuspectMatch as false.
    6. Detect suspicious behaviors (loitering, running, abandoned objects, aggressive gestures, unauthorized entry).
    7. Detect objects (bags, weapons, vehicles, electronics).
    8. Return coordinates [x, y, w, h] for all detected faces in Image Part 1 (normalized 0-1000).
    9. For each face in the 'faces' array, set 'isSuspect' to true ONLY if that specific face matches a suspect.

    Return the analysis in the specified JSON format. Accuracy is more important than finding a match.
  `;

  try {
    const contents = [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(",")[1] || base64Image
            }
          },
          ...suspects.map(s => {
            if (!s.image_data) return null;
            try {
              return {
                inlineData: {
                  mimeType: s.image_data.split(";")[0].split(":")[1] || "image/jpeg",
                  data: s.image_data.split(",")[1] || s.image_data
                }
              };
            } catch (e) {
              return null;
            }
          }).filter(Boolean) as any[]
        ]
      }
    ];

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isSuspectMatch: { type: Type.BOOLEAN },
            suspectId: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            behavior: { type: Type.STRING },
            isSuspicious: { type: Type.BOOLEAN },
            detectedObjects: { type: Type.ARRAY, items: { type: Type.STRING } },
            faces: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  w: { type: Type.NUMBER },
                  h: { type: Type.NUMBER },
                  isSuspect: { type: Type.BOOLEAN }
                },
                required: ["x", "y", "w", "h", "isSuspect"]
              }
            }
          },
          required: ["isSuspectMatch", "confidence", "behavior", "isSuspicious", "detectedObjects", "faces"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      isSuspectMatch: false,
      confidence: 0,
      behavior: "Analysis failed",
      isSuspicious: false,
      detectedObjects: [],
      faces: []
    };
  }
}
