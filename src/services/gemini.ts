import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

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
    Analyze the surveillance frame (Image Part 1) against the suspect database.
    
    Suspect Database:
    ${suspectContext}

    Instructions:
    1. Detect all faces in Image Part 1.
    2. Compare each face against the database descriptions and reference images.
    3. Set 'isSuspectMatch' to true ONLY if there is a high-confidence visual match (>85%).
    4. Detect suspicious behaviors (loitering, running, weapons, unauthorized entry).
    5. Return coordinates [x, y, w, h] (0-1000) for all faces.
    6. Return JSON format.
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
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction: "You are a high-speed surveillance analysis AI. Focus on accuracy and speed. Minimize reasoning, maximize detection precision.",
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
