import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AdminPage } from "./pages/AdminPage";
import { BookingPage } from "./pages/BookingPage";
import { CookiesPage } from "./pages/CookiesPage";
import { LandingPage } from "./pages/LandingPage";
import { ManageBookingPage } from "./pages/ManageBookingPage";
import { MonitoringPage } from "./pages/MonitoringPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { ServicesPage } from "./pages/ServicesPage";
import { VerifyBookingPage } from "./pages/VerifyBookingPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/booking" element={<BookingPage />} />
        <Route path="/manage-booking" element={<ManageBookingPage />} />
        <Route path="/verify-booking" element={<VerifyBookingPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/cookies" element={<CookiesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="/admin/*" element={<AdminPage />} />
      <Route path="/monitoring/*" element={<MonitoringPage />} />
    </Routes>
  );
}
