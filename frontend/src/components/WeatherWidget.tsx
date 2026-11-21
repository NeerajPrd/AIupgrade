"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { z } from "zod";
import { MapPin } from "lucide-react";

const WeatherSchema = z.object({
  temperature: z.number().min(-30).max(50),
  feelsLike: z.number(),
  maxTemp: z.number(),
  minTemp: z.number(),
  description: z.string(),
  weatherIcon: z.string(),
  city: z.string(),
  country: z.string(),
});

type WeatherData = z.infer<typeof WeatherSchema>;
type LocationState = {
  status: "idle" | "loading" | "success" | "error";
  error?: string;
  coords?: { latitude: number; longitude: number };
};

async function fetchWeatherData(
  latitude?: number,
  longitude?: number
): Promise<WeatherData | null> {
  const url = new URL("/api/weather", window.location.origin);
  if (latitude && longitude) {
    url.searchParams.set("latitude", latitude.toString());
    url.searchParams.set("longitude", longitude.toString());
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Weather fetch failed");
    return WeatherSchema.parse(await response.json());
  } catch (error) {
    console.error("Weather error:", error);
    return null;
  }
}

function WeatherWidgetContent({ data }: { data: WeatherData }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        <MapPin className="w-4 h-4" />
        <span>
          {data.city}, {data.country}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-2xl font-medium text-gray-900 dark:text-gray-200">
          {data.temperature}°C
        </span>
        <img
          src={data.weatherIcon}
          alt="Weather icon"
          className="w-8 h-8"
          loading="lazy"
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600 dark:text-gray-400 capitalize">
          {data.description}
        </span>
        <span className="text-gray-500">Feels like {data.feelsLike}°C</span>
      </div>
    </div>
  );
}

function WeatherContent() {
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);

  const handleGeolocationError = useCallback(
    (error: GeolocationPositionError) => {
      let errorMessage = "Location access required for local weather";
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = "Weather data for default location";
          break;
        case error.TIMEOUT:
          errorMessage = "Location request timed out";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = "Location service unavailable";
          break;
      }
      setLocation({ status: "error", error: errorMessage });
    },
    []
  );

  const loadWeather = useCallback(
    async (coords?: { latitude: number; longitude: number }) => {
      try {
        const data = await fetchWeatherData(
          coords?.latitude,
          coords?.longitude
        );
        if (data) {
          setWeatherData(data);
          setLocation((prev) => ({ ...prev, status: "success" }));
        }
      } catch (error) {
        console.error("Weather fetch error:", error);
        setLocation({ status: "error", error: "Failed to load weather data" });
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();

    const getLocation = async () => {
      setLocation({ status: "loading" });

      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 3000,
              maximumAge: 60000,
            });
          }
        );

        loadWeather({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch (error) {
        if (error instanceof GeolocationPositionError) {
          handleGeolocationError(error);
        } else {
          setLocation({ status: "error", error: "Failed to get location" });
        }
        // Load default location weather
        loadWeather();
      }
    };

    getLocation();
    return () => controller.abort();
  }, [handleGeolocationError, loadWeather]);

  if (location.status === "loading") {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-4 w-32 bg-gray-200 rounded" />
        <div className="h-8 w-24 bg-gray-200 rounded" />
        <div className="h-3 w-48 bg-gray-200 rounded" />
      </div>
    );
  }

  if (location.status === "error" || !weatherData) {
    return (
      <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-600 dark:text-gray-400">
        {location.error || "Weather data unavailable"}
      </div>
    );
  }

  return <WeatherWidgetContent data={weatherData} />;
}

export default function WeatherWidget() {
  return (
    <div className="bg-white/40 flex-1 backdrop-blur-3xl border border-gray-100 dark:border-gray-700  dark:bg-navy-800 rounded-lg shadow-md p-6 flex flex-col justify-between">
      <Suspense fallback={<div className="h-[120px]" />}>
        <WeatherContent />
      </Suspense>
    </div>
  );
}
