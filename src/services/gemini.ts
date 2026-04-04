import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const getApiKey = () => {
  // Try various common ways the key might be injected or defined
  return (
    (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : null) ||
    (import.meta.env?.VITE_GEMINI_API_KEY) ||
    ""
  );
};

export async function analyzeFrame(base64Image: string, suspects: any[]): Promise<AnalysisResult> {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return {
      isSuspectMatch: false,
      confidence: 0,
      behavior: "API Key Missing. Please set GEMINI_API_KEY in environment variables.",
      isSuspicious: false,
      detectedObjects: [],
      faces: []
    };
  }

  if (!base64Image || base64Image.length < 100) {
    return {
      isSuspectMatch: false,
      confidence: 0,
      behavior: "No image data captured.",
      isSuspicious: false,
      detectedObjects: [],
      faces: []
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";
  
  // Limit suspects to top 10 to avoid exceeding request size limits
  const relevantSuspects = suspects
    .sort((a, b) => {
      const riskOrder = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
      return (riskOrder[a.risk_level as keyof typeof riskOrder] || 4) - (riskOrder[b.risk_level as keyof typeof riskOrder] || 4);
    })
    .slice(0, 10);

  let imagePartIndex = 2;
  const suspectContext = relevantSuspects.map((s) => {
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
    const imageData = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;
    
    const contents = [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageData
            }
          },
          ...relevantSuspects.map(s => {
            if (!s.image_data) return null;
            try {
              const data = s.image_data.includes(",") ? s.image_data.split(",")[1] : s.image_data;
              const mimeType = s.image_data.includes(";") ? s.image_data.split(";")[0].split(":")[1] : "image/jpeg";
              return {
                inlineData: {
                  mimeType: mimeType || "image/jpeg",
                  data: data
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
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    let errorMessage = "Analysis failed";
    
    if (error.message?.includes("API key not valid")) {
      errorMessage = "Invalid API Key. Please check your Gemini API settings.";
    } else if (error.message?.includes("quota")) {
      errorMessage = "API Quota exceeded. Please try again later.";
    } else if (error.message?.includes("Safety")) {
      errorMessage = "Analysis blocked by safety filters.";
    }
    
    return {
      isSuspectMatch: false,
      confidence: 0,
      behavior: errorMessage,
      isSuspicious: false,
      detectedObjects: [],
      faces: []
    };
  }
}
