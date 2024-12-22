# Gunakan base image resmi Node.js versi LTS
FROM node:18

# Atur direktori kerja di container
WORKDIR /usr/src/app

# Salin file package.json dan package-lock.json ke dalam container
COPY package*.json ./

# Instal dependensi aplikasi
RUN npm install

# Salin seluruh file aplikasi ke dalam container
COPY . .

# Ekspos port yang akan digunakan aplikasi
EXPOSE 8080

# Jalankan aplikasi saat container dimulai
CMD ["node", "server.js"]
