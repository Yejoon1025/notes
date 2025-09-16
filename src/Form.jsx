import { useState, useEffect } from "react";
import axios from "axios";

const SHEET_ENDPOINT = "https://api.sheetbest.com/sheets/840ceaae-c60e-47ab-a95e-d2c9348dd68f"; 

export default function Form() {
  const [form, setForm] = useState({ context: "", content: "" });
  const [nextId, setNextId] = useState(1);

  // Fetch last row’s ID to determine nextId
  useEffect(() => {
    axios.get(SHEET_ENDPOINT).then((res) => {
      if (res.data.length > 0) {
        const lastRow = res.data[res.data.length - 1];
        const lastId = parseInt(lastRow.ID, 10) || 0;
        setNextId(lastId + 1);
      } else {
        setNextId(1);
      }
    });
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Date format: YYYY-MM-DD HH:mm:ss (24hr)
    const now = new Date().toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).replace(",", ""); // remove comma between date & time

    try {
      await axios.post(SHEET_ENDPOINT, {
        ID: nextId,
        Date: now,
        Context: form.context,
        Content: form.content,
      });

      alert(`Row #${nextId} added ✅`);
      setForm({ context: "", content: "" });

      // Increment ID for next entry
      setNextId(nextId + 1);
    } catch (err) {
      console.error(err);
      alert("Error ❌");
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: "50px auto", fontFamily: "sans-serif" }}>
      <form onSubmit={handleSubmit}>
        <textarea
          name="context"
          placeholder="Context"
          value={form.context}
          onChange={handleChange}
          required
          style={{ display: "block", marginBottom: "10px", width: "100%", padding: "8px" }}
        />
        <textarea
          name="content"
          placeholder="Content"
          value={form.content}
          onChange={handleChange}
          required
          style={{ display: "block", marginBottom: "10px", width: "100%", padding: "8px" }}
        />
        <button type="submit" style={{ padding: "10px 20px" }}>
          Add Snippet
        </button>
      </form>
    </div>
  );
}