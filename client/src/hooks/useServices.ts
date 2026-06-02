import { useCallback, useEffect, useMemo, useState } from "react";
import { getServices } from "../api";
import { serviceCatalog } from "../data/services";
import type { Service } from "../types";

export function useServices() {
  const [services, setServices] = useState<Service[]>(serviceCatalog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadServices() {
      setLoading(true);
      setError("");

      try {
        const response = await getServices();

        if (!isActive) {
          return;
        }

        setServices(response.services);
      } catch (requestError) {
        if (!isActive) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : "Could not load services.");
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    void loadServices();

    return () => {
      isActive = false;
    };
  }, []);

  const servicesById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services]
  );
  const findService = useCallback(
    (serviceId: string | null | undefined) =>
      serviceId ? servicesById.get(serviceId) : undefined,
    [servicesById]
  );

  return {
    services,
    loading,
    error,
    findService
  };
}
