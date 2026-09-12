import { Route, Routes } from "react-router-dom";
import { createLetterApi } from "./api/letters";
import { ComposePage } from "./compose/ComposePage";
import { LetterPage } from "./letter/LetterPage";
import { LandingPage } from "./landing/LandingPage";

const api = createLetterApi();

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/compose" element={<ComposePage api={api} />} />
      <Route path="/letter/:id" element={<LetterPage api={api} />} />
    </Routes>
  );
}
