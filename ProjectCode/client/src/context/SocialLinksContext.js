import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSocialLinks } from '../api/settings';

const SocialLinksContext = createContext();

// Default fallback values (hardcoded for resilience)
const DEFAULT_SOCIAL_LINKS = {
  instagram: 'https://www.instagram.com/newbeerunningclub/',
  xiaohongshu: 'https://xhslink.com/m/8znk8WTxhjd',
  heylo: 'https://www.heylo.com/g/b7bf1310-ca40-4d4d-9da5-2b7f4f3c197e',
  shop: ''
};

export function useSocialLinks() {
  return useContext(SocialLinksContext);
}

export function SocialLinksProvider({ children }) {
  const [socialLinks, setSocialLinks] = useState(DEFAULT_SOCIAL_LINKS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSocialLinks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const links = await getSocialLinks();

      // Merge with defaults - use API values if available, fallback to defaults
      setSocialLinks({
        instagram: links.instagram || DEFAULT_SOCIAL_LINKS.instagram,
        xiaohongshu: links.xiaohongshu || DEFAULT_SOCIAL_LINKS.xiaohongshu,
        heylo: links.heylo || DEFAULT_SOCIAL_LINKS.heylo,
        shop: links.shop || DEFAULT_SOCIAL_LINKS.shop
      });
    } catch (err) {
      console.error('Error fetching social links:', err);
      setError(err.message || 'Failed to load social links');
      // Keep defaults on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSocialLinks();
  }, [fetchSocialLinks]);

  // Function to refresh links (useful after admin updates)
  const refreshLinks = useCallback(() => {
    fetchSocialLinks();
  }, [fetchSocialLinks]);

  const value = {
    socialLinks,
    loading,
    error,
    refreshLinks
  };

  return (
    <SocialLinksContext.Provider value={value}>
      {children}
    </SocialLinksContext.Provider>
  );
}
