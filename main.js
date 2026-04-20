// Initialize CSInterface
const csInterface = new CSInterface();

document.addEventListener("DOMContentLoaded", () => {
    const btnSync = document.getElementById("btn-sync");
    const statusText = document.getElementById("status-text");
    const statusCard = document.querySelector(".status-card");
    const btnText = document.querySelector(".btn-text");
    const loader = document.querySelector(".loader");

    btnSync.addEventListener("click", () => {
        // Set Loading State
        btnSync.disabled = true;
        btnText.classList.add("hidden");
        loader.classList.remove("hidden");
        
        statusText.textContent = "Analyzing selection & talking to AE...";
        statusCard.classList.remove("error", "success");
        
        // Read Analysis Checkbox
        const isDetailed = document.getElementById("chk-detailed").checked;

        // Execute ExtendScript function
        csInterface.evalScript(`sendSelectedClips(${isDetailed})`, (result) => {
            // Revert Button State
            btnSync.disabled = false;
            btnText.classList.remove("hidden");
            loader.classList.add("hidden");
            
            // Parse result
            try {
                const response = JSON.parse(result);
                if (response.success) {
                    statusCard.classList.add("success");
                    statusText.textContent = response.message;
                } else {
                    statusCard.classList.add("error");
                    statusText.textContent = response.message;
                }
            } catch (e) {
                // Formatting fail or unhandled error string
                statusCard.classList.add("error");
                statusText.textContent = "Unexpected result from JSX: " + result;
            }
        });
    });
});
