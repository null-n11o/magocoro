import { Route, Routes } from "react-router-dom";
import { ComposePage } from "./compose/ComposePage";
import { LetterPage } from "./letter/LetterPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ComposePage />} />
      <Route path="/letter/:id" element={<LetterPage />} />
    </Routes>
  );
}
