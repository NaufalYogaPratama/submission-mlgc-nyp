const express = require("express");
const multer = require("multer");
const tf = require("@tensorflow/tfjs-node");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");

// Firebase Initialization
const serviceAccount = require("./submissionmlgc-naufalyp-445417-656467963271.json");
initializeApp({
  credential: cert(serviceAccount),
});
const db = getFirestore();

// TensorFlow Model
async function loadModel() {
  try {
    const modelURL =
      "https://storage.googleapis.com/bucket-submission-naufalyp/model-in-prod/model.json";
    const weightsManifestURL =
      "https://storage.googleapis.com/bucket-submission-naufalyp/model-in-prod/weights_manifest.json";
    const model = await tf.loadGraphModel(modelURL, weightsManifestURL);
    console.log("Model loaded successfully");
    return model;
  } catch (error) {
    console.error("Error loading model:", error);
    throw error;
  }
}
const app = express();

app.use(
  cors({
    origin: "*", // Ganti dengan domain dari aplikasi frontend Anda
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.options("*", cors());

const upload = multer({ limits: { fileSize: 1 * 1024 * 1024 } }); // Limit file size to 1MB
app.post("/predict", upload.single("image"), async (req, res) => {
  try {
    const { buffer } = req.file;

    // Preprocessing
    const image = tf.node
      .decodeImage(buffer, 3)
      .resizeNearestNeighbor([224, 224])
      .div(255)
      .expandDims(0);

    const model = await loadModel();
    const prediction = model.predict(image);
    const predictionData = await prediction.data();

    console.log("Prediction Data:", predictionData);

    // Define thresholds
    const threshold = 0.579;

    // Determine result
    let result = predictionData[0] > threshold ? "Cancer" : "Non-cancer";
    let suggestion =
      result === "Cancer"
        ? "Segera periksa ke dokter!"
        : "Penyakit kanker tidak terdeteksi.";

    // Check if the prediction is ambiguous (e.g., close to 0.5)
    if (predictionData[0] < 0.5) {
      return res.status(400).json({
        status: "fail",
        message: "Terjadi kesalahan dalam melakukan prediksi",
        data: {
          prediction: predictionData[0],
        },
      });
    }

    // Save prediction to Firestore
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    const data = { id, result, suggestion, createdAt };

    // Save to Firestore before sending response
    await db.collection("predictions").doc(id).set(data);

    // Send response after saving
    res.status(201).json({
      status: "success",
      message: "Model is predicted successfully",
      data,
    });
  } catch (error) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        status: "fail",
        message: "Payload content length greater than maximum allowed: 1000000",
      });
    } else {
      console.error(error);
      res.status(400).json({
        status: "fail",
        message: "Terjadi kesalahan dalam melakukan prediksi",
      });
    }
  }
});

// Error handling middleware for Multer
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({
      status: "fail",
      message: "Payload content length greater than maximum allowed: 1000000",
    });
  } else {
    next(err);
  }
});

app.get("/predict/histories", async (req, res) => {
  try {
    const snapshot = await db.collection("predictions").get();
    const histories = snapshot.docs.map((doc) => ({
      id: doc.id,
      history: doc.data(),
    }));

    res.status(200).json({ status: "success", data: histories });
  } catch (error) {
    res
      .status(500)
      .json({ status: "fail", message: "Failed to retrieve histories" });
  }
});

app.listen(8080, () => console.log("Server is running on port 8080"));
