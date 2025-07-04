self.addEventListener('push',function(event){
    const data = event.data?event.data.json() :{};
    const title = data.title || "Notification";
    const options = {
        body : data.body || "",
        icon:data.icon || "icon.png",
        // badge: data.badge || "badge.png",
    }
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
})