import React, { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { SearchPage } from './pages/SearchPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { LegalPage } from './pages/LegalPage';
import { AdminPage } from './pages/AdminPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ShaderLabAppPage } from './pages/ShaderLabAppPage';

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const MainShell: React.FC = () => {
  const { pathname } = useLocation();
  const isStandaloneApp = pathname.startsWith('/apps/');

  if (isStandaloneApp) {
    return (
      <Routes>
        <Route path="/apps/g-wave-shaderlab" element={<ShaderLabAppPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<CatalogPage />} />
          <Route path="/games" element={<CatalogPage forcedCategory="games" />} />
          <Route path="/android" element={<CatalogPage forcedCategory="android" />} />
          <Route path="/windows" element={<CatalogPage forcedCategory="windows" />} />
          <Route path="/web-apps" element={<CatalogPage forcedCategory="web" />} />
          <Route path="/category/:category" element={<CatalogPage />} />
          <Route path="/product/:slug" element={<ProductDetailPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<LegalPage mode="privacy" />} />
          <Route path="/terms" element={<LegalPage mode="terms" />} />
          <Route path="/admin" element={<AdminPage initialTab="overview" />} />
          <Route path="/admin/products" element={<AdminPage initialTab="products" />} />
          <Route path="/admin/releases" element={<AdminPage initialTab="github" />} />
          <Route path="/admin/analytics" element={<AdminPage initialTab="overview" />} />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
};

export function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <BrowserRouter>
            <ScrollToTop />
            <MainShell />
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
