"use client";

import React, { useState } from "react";
import { Check, Upload, User, Mail, Globe, MapPin, Link } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { showSuccessToast, showErrorToast } from "@/utils/toast";

const ProfileUpdate = () => {
  const [formData, setFormData] = useState({
    name: "John Doe",
    email: "john@example.com",
    profileImage: "/spirit-monkey-icon.png",
    bio: "Software developer passionate about creating user-friendly applications.",
    location: "San Francisco, CA",
    website: "https://johndoe.dev",
    twitter: "@johndoe",
    github: "johndoe",
  });

  const [imagePreview, setImagePreview] = useState(formData.profileImage);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ... (validation functions remain the same)
  const validateImage = (url: string) => {
    return url ? url.match(/\.(jpg|jpeg|png|svg)$/i) : true;
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Invalid email format";
    }

    if (formData.profileImage && !validateImage(formData.profileImage)) {
      newErrors.profileImage = "Image URL must end with .jpg, .jpeg, or .png";
    }

    if (formData.website && !/^https?:\/\//.test(formData.website)) {
      newErrors.website = "Website must start with http:// or https://";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setFormData((prev) => ({ ...prev, profileImage: url }));

    if (validateImage(url)) {
      setImagePreview(url);
      setErrors((prev) => ({ ...prev, profileImage: "" }));
    } else {
      setErrors((prev) => ({
        ...prev,
        profileImage: "Image URL must end with .jpg, .jpeg, or .png",
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showErrorToast("Please check the form for errors");
      return;
    }

    setIsSubmitting(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      showSuccessToast("Profile updated successfully");
    } catch (error) {
      showErrorToast("Failed to update profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFormData({
      name: "John Doe",
      email: "john@example.com",
      profileImage: "/spirit-monkey-icon.png",
      bio: "Software developer passionate about creating user-friendly applications.",
      location: "San Francisco, CA",
      website: "https://johndoe.dev",
      twitter: "@johndoe",
      github: "johndoe",
    });
    setImagePreview("https://example.com/placeholder.jpg");
    setErrors({});
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-7xl">
        <Card className="border-0 shadow-xl bg-white dark:bg-gray-800">
          <CardHeader className="border-b border-gray-100 dark:border-gray-700">
            <CardTitle className="text-3xl font-bold text-gray-900 dark:text-white">
              User Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Profile Image Section */}
              <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-start">
                <div className="relative w-40 h-40 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 ring-4 ring-white dark:ring-gray-800 shadow-lg">
                  <img
                    src={imagePreview}
                    alt="Profile"
                    className="w-full h-full object-cover"
                    onError={() => setImagePreview("/placeholder-avatar.jpg")}
                  />
                </div>

                <div className="flex-1 w-full space-y-2">
                  <Label
                    htmlFor="profileImage"
                    className="text-gray-700 dark:text-gray-200"
                  >
                    Profile Image URL
                  </Label>
                  <Input
                    id="profileImage"
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    value={formData.profileImage}
                    onChange={handleImageChange}
                    className={`${
                      errors.profileImage
                        ? "border-red-500"
                        : "border-gray-200 dark:border-gray-600"
                    } bg-white dark:bg-gray-700`}
                  />
                  {errors.profileImage && (
                    <p
                      className="text-sm text-red-500 font-medium"
                      aria-live="polite"
                    >
                      {errors.profileImage}
                    </p>
                  )}
                </div>
              </div>

              {/* Basic Info */}
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="name"
                    className="text-gray-700 dark:text-gray-200"
                  >
                    Full Name
                  </Label>
                  <div className="relative">
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      className={`${
                        errors.name
                          ? "border-red-500"
                          : "border-gray-200 dark:border-gray-600"
                      } bg-white dark:bg-gray-700 pr-10`}
                    />
                    <User className="w-5 h-5 absolute right-3 top-2.5 text-gray-400" />
                  </div>
                  {errors.name && (
                    <p
                      className="text-sm text-red-500 font-medium"
                      aria-live="polite"
                    >
                      {errors.name}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-gray-700 dark:text-gray-200"
                  >
                    Email Address
                  </Label>
                  <div className="relative">
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      className={`${
                        errors.email
                          ? "border-red-500"
                          : "border-gray-200 dark:border-gray-600"
                      } bg-white dark:bg-gray-700 pr-10`}
                    />
                    <Mail className="w-5 h-5 absolute right-3 top-2.5 text-gray-400" />
                  </div>
                  {errors.email && (
                    <p
                      className="text-sm text-red-500 font-medium"
                      aria-live="polite"
                    >
                      {errors.email}
                    </p>
                  )}
                </div>
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <Label
                  htmlFor="bio"
                  className="text-gray-700 dark:text-gray-200"
                >
                  Professional Bio
                </Label>
                <Textarea
                  id="bio"
                  placeholder="Tell us about your professional journey..."
                  value={formData.bio}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, bio: e.target.value }))
                  }
                  className="min-h-[120px] resize-none bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600"
                />
              </div>

              {/* Location and Website */}
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="location"
                    className="text-gray-700 dark:text-gray-200"
                  >
                    Location
                  </Label>
                  <div className="relative">
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          location: e.target.value,
                        }))
                      }
                      className="bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 pr-10"
                    />
                    <MapPin className="w-5 h-5 absolute right-3 top-2.5 text-gray-400" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="website"
                    className="text-gray-700 dark:text-gray-200"
                  >
                    Portfolio Website
                  </Label>
                  <div className="relative">
                    <Input
                      id="website"
                      type="url"
                      value={formData.website}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          website: e.target.value,
                        }))
                      }
                      className={`${
                        errors.website
                          ? "border-red-500"
                          : "border-gray-200 dark:border-gray-600"
                      } bg-white dark:bg-gray-700 pr-10`}
                    />
                    <Globe className="w-5 h-5 absolute right-3 top-2.5 text-gray-400" />
                  </div>
                  {errors.website && (
                    <p
                      className="text-sm text-red-500 font-medium"
                      aria-live="polite"
                    >
                      {errors.website}
                    </p>
                  )}
                </div>
              </div>

              {/* Social Links */}
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label
                    htmlFor="twitter"
                    className="text-gray-700 dark:text-gray-200"
                  >
                    Twitter Profile
                  </Label>
                  <div className="relative">
                    <Input
                      id="twitter"
                      value={formData.twitter}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          twitter: e.target.value,
                        }))
                      }
                      className="bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 pr-10"
                    />
                    <Link className="w-5 h-5 absolute right-3 top-2.5 text-gray-400" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="github"
                    className="text-gray-700 dark:text-gray-200"
                  >
                    GitHub Profile
                  </Label>
                  <div className="relative">
                    <Input
                      id="github"
                      value={formData.github}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          github: e.target.value,
                        }))
                      }
                      className="bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 pr-10"
                    />
                    <Link className="w-5 h-5 absolute right-3 top-2.5 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row justify-end gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  className="w-full sm:w-auto"
                >
                  Reset Changes
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                >
                  {isSubmitting ? (
                    <>
                      <Upload className="mr-2 h-4 w-4 animate-spin" />
                      Updating Profile...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProfileUpdate;
