-- Enable Realtime for attendance schema tables

-- Add temp_registrations to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE attendance.temp_registrations;
